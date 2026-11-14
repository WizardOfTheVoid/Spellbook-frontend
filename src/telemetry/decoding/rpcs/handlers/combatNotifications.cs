namespace SpellBook.Telemetry;

public static class CombatNotifications
{
    public static (string Kind, Dictionary<string, object?> Fields)? Read(string component, int id, string direction, BitReader r, NetGuidCache cache)
    {
        Dictionary<string, object?> values = [];
        int Integer() => unchecked((int)r.Bits(32));
        int Byte() => (int)r.Bits(8);
        bool Flag() => r.Bits(1) != 0;
        float Number()
        {
            var value = r.Float();
            return float.IsFinite(value) ? value : throw new InvalidDataException("Nonfinite combat timestamp");
        }
        object Reference()
        {
            return ObjectReference.Read(r, cache);
        }
        void Optional(string name, Func<object?> read)
        {
            var present = Flag();
            values[$"{name}Present"] = present;
            values[name] = present ? read() : null;
        }
        bool Params()
        {
            var present = Flag();
            values["paramsPresent"] = present;
            return present;
        }
        string kind;
        if (component == "abilities" && id == 2 && direction == "fromServer")
        {
            kind = "abilityInitiated";
            if (Params()) { values["abilitySpec"] = Reference(); values["invocationId"] = Integer(); values["attackId"] = Integer(); }
        }
        else if (component == "abilities" && id == 3 && direction == "fromServer")
        {
            kind = "abilityInvocationCompleted";
            Optional("invocationId", () => Integer());
        }
        else if (component == "abilities" && id == 7 && direction == "toServer")
        {
            kind = "abilityRequested";
            if (Params())
            {
                values["abilitySpec"] = Reference(); values["inventoryItem"] = Reference();
                values["clientTimestamp"] = Number(); values["attackIndex"] = Byte(); values["preMovement"] = Flag();
            }
        }
        else if (component == "abilities" && id == 6 && direction == "toServer")
        {
            kind = "attackRequested";
            Optional("abilitySpec", Reference);
            if (Params())
            {
                values["attackId"] = Integer(); values["previousAttackId"] = Integer(); values["clientTimestamp"] = Number();
                values["inventoryItem"] = Reference(); values["emoteId"] = Integer(); values["attackTransition"] = (int)r.Bits(2);
                foreach (var name in new[] { "combatStateIndex", "previousCombatStateIndex", "attackIndex", "inputActionIndex" }) values[name] = Byte();
                foreach (var name in new[] { "altComboState", "altAttack", "endAnimation", "isFeint", "isFeintCombo", "isCounter", "isCounterSuccess", "comboFromBlocked", "comboFromDoingParryBreak", "comboFromMissedAttack", "isMultiAttack", "isPreMovement" }) values[name] = Flag();
            }
        }
        else if (component == "combat" && id == 21 && direction == "toServer")
        {
            kind = "heavyAttackDecision";
            if (Params())
            {
                values["clientTimestamp"] = Number(); values["animationTimerOvertime"] = Number();
                values["attackId"] = Integer(); values["isHeavy"] = Flag(); values["isPreMovement"] = Flag();
            }
        }
        else if (component == "combat" && id == 13 && direction == "toServer")
        {
            kind = "attackCancelRequested";
            if (Params())
            {
                values["clientTimestamp"] = Number(); values["attackId"] = Integer();
                values["clientCombatStateIndex"] = Byte(); values["isPreMovement"] = Flag();
            }
        }
        else if (component == "combatQueue" && id is 2 or 5 && direction == "toServer")
        {
            kind = id == 2 ? "heldInputAdded" : "heldInputRemoved";
            Optional("inputActionName", () => Flag() ? new { Index = r.Packed() } : (object)new { Name = UnrealStrings.Read(r), Number = r.Bits(32) });
        }
        else if (component == "combatQueue" && id == 4 && direction == "toServer") kind = "parryRequested";
        else return null;
        if (r.Remaining != 0) throw new UnsupportedFieldException("Unknown combat suffix");
        return (kind, values);
    }
}
