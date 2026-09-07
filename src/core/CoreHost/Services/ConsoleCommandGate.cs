using CoreHost.Models;

namespace CoreHost.Services;

public sealed record ConsoleCommandLease(
    long SessionId,
    ValidatedRestoreTarget RestoreTarget,
    bool StartsSession);

public sealed class ConsoleCommandGate(MouseClickSuppression mouseClicks)
{
    private readonly object _sync = new();
    private readonly Queue<Waiter> _waiters = [];
    private Session? _session;
    private bool _closing;
    private long _nextSessionId;

    internal ConsoleCommandGate() : this(new MouseClickSuppression())
    {
    }

    public Task<ConsoleCommandLease> WaitAsync(
        ValidatedRestoreTarget restoreTarget,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        lock (_sync)
        {
            if (_session is null)
            {
                _session = NewSession(restoreTarget);
                return Task.FromResult(Lease(_session, startsSession: true));
            }

            var waiter = new Waiter(restoreTarget, cancellationToken);
            _waiters.Enqueue(waiter);
            return waiter.Task;
        }
    }

    public async Task<IReadOnlyList<string>> CompleteAsync(
        ConsoleCommandLease lease,
        bool canContinue,
        Func<Task<IReadOnlyList<string>>> closeSession,
        int afterQueueEmptyMs = 0)
    {
        Session session;
        var shouldClose = true;
        var queueEmpty = false;

        lock (_sync)
        {
            session = GetSession(lease);
            if (!_closing && canContinue && TryHandOff(session))
            {
                shouldClose = false;
            }
            else
            {
                _closing = true;
                queueEmpty = _waiters.All(waiter => waiter.Task.IsCompleted);
            }
        }

        if (shouldClose)
        {
            if (queueEmpty && afterQueueEmptyMs > 0)
            {
                await Task.Delay(afterQueueEmptyMs, CancellationToken.None).ConfigureAwait(false);
            }

            var warnings = await CloseAsync(closeSession).ConfigureAwait(false);
            FinishSession(session, warnings);
        }

        return await session.Completion.Task.ConfigureAwait(false);
    }

    private bool TryHandOff(Session session)
    {
        while (_waiters.Count > 0)
        {
            var waiter = _waiters.Peek();
            if (waiter.Task.IsCompleted)
            {
                _waiters.Dequeue().Dispose();
                continue;
            }

            if (waiter.RestoreTarget != session.RestoreTarget)
            {
                return false;
            }

            _waiters.Dequeue();
            if (waiter.Grant(Lease(session, startsSession: false)))
            {
                return true;
            }
        }

        return false;
    }

    private void FinishSession(Session session, IReadOnlyList<string> warnings)
    {
        lock (_sync)
        {
            if (!ReferenceEquals(_session, session))
            {
                return;
            }

            _session = null;
            _closing = false;
            session.Completion.TrySetResult(warnings);

            while (_waiters.Count > 0)
            {
                var waiter = _waiters.Dequeue();
                if (waiter.Task.IsCompleted)
                {
                    waiter.Dispose();
                    continue;
                }

                var nextSession = NewSession(waiter.RestoreTarget);
                _session = nextSession;
                if (waiter.Grant(Lease(nextSession, startsSession: true)))
                {
                    break;
                }

                nextSession.MouseClickSuppression.Dispose();
                _session = null;
            }

            session.MouseClickSuppression.Dispose();
        }
    }

    private Session GetSession(ConsoleCommandLease lease)
    {
        if (_session is null || _session.Id != lease.SessionId)
        {
            throw new InvalidOperationException("The console command lease is no longer active.");
        }

        return _session;
    }

    private Session NewSession(ValidatedRestoreTarget restoreTarget)
    {
        return new Session(
            ++_nextSessionId,
            restoreTarget,
            mouseClicks.Suppress());
    }

    private static ConsoleCommandLease Lease(Session session, bool startsSession)
    {
        return new ConsoleCommandLease(session.Id, session.RestoreTarget, startsSession);
    }

    private static async Task<IReadOnlyList<string>> CloseAsync(
        Func<Task<IReadOnlyList<string>>> closeSession)
    {
        try
        {
            return await closeSession().ConfigureAwait(false);
        }
        catch
        {
            return ["INPUT_FAILED"];
        }
    }

    private sealed record Session(
        long Id,
        ValidatedRestoreTarget RestoreTarget,
        IDisposable MouseClickSuppression)
    {
        public TaskCompletionSource<IReadOnlyList<string>> Completion { get; } =
            new(TaskCreationOptions.RunContinuationsAsynchronously);
    }

    private sealed class Waiter : IDisposable
    {
        private readonly CancellationTokenRegistration _cancellationRegistration;
        private readonly TaskCompletionSource<ConsoleCommandLease> _completion =
            new(TaskCreationOptions.RunContinuationsAsynchronously);

        public Waiter(ValidatedRestoreTarget restoreTarget, CancellationToken cancellationToken)
        {
            RestoreTarget = restoreTarget;
            _cancellationRegistration = cancellationToken.Register(
                () => _completion.TrySetCanceled(cancellationToken));
        }

        public ValidatedRestoreTarget RestoreTarget { get; }

        public Task<ConsoleCommandLease> Task => _completion.Task;

        public bool Grant(ConsoleCommandLease lease)
        {
            Dispose();
            return _completion.TrySetResult(lease);
        }

        public void Dispose() => _cancellationRegistration.Dispose();
    }
}
