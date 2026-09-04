using CoreHost.Win32;

namespace CoreHost.Services;

public sealed class MouseClickSuppression
{
    private int _leaseCount;

    public bool IsActive => Volatile.Read(ref _leaseCount) > 0;

    public IDisposable Suppress()
    {
        Interlocked.Increment(ref _leaseCount);
        return new SuppressionLease(this);
    }

    internal bool ShouldSuppress(int code, IntPtr message)
    {
        return code >= 0 && IsActive && message.ToInt64() is
            NativeMethods.WM_LBUTTONDOWN or
            NativeMethods.WM_LBUTTONUP or
            NativeMethods.WM_RBUTTONDOWN or
            NativeMethods.WM_RBUTTONUP or
            NativeMethods.WM_MBUTTONDOWN or
            NativeMethods.WM_MBUTTONUP or
            NativeMethods.WM_XBUTTONDOWN or
            NativeMethods.WM_XBUTTONUP;
    }

    private void Release()
    {
        Interlocked.Decrement(ref _leaseCount);
    }

    private sealed class SuppressionLease(MouseClickSuppression owner) : IDisposable
    {
        private int _disposed;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _disposed, 1) == 0)
            {
                owner.Release();
            }
        }
    }
}
