namespace SpellBook.Telemetry;

public static class StatsNotifications
{
    public static (string Kind, Dictionary<string, object?> Fields)? Read(int id, BitReader r)
    {
        Dictionary<string, object?> values = [];
        object? Optional(string name, Func<object?> read)
        {
            var present = r.Bits(1) != 0;
            values[$"{name}Present"] = present;
            return values[name] = present ? read() : null;
        }
        float Number()
        {
            var value = r.Float();
            return float.IsFinite(value) ? value : throw new InvalidDataException("Nonfinite notification");
        }
        uint Guid() => ComponentProperties.Reference(r);
        string kind;
        if (id == 7)
        {
            kind = "damage";
            if (r.Bits(1) == 0) throw new UnsupportedFieldException("Unobserved absent damage event");
            values["abilitySpecGuid"] = Guid();
            if (r.Bits(1) == 0) throw new UnsupportedFieldException("Unobserved damage name");
            values["abilitiesTableRow"] = r.Packed();
            values["amount"] = Number();
            values["resultingValue"] = Number();
            foreach (var name in new[] { "damageSourceGuid", "damageCauserGuid", "damageTakerGuid", "damageInstigatorGuid" }) values[name] = Guid();
            values["flagsRaw"] = r.Bits(6);
            values["locationUnresolved"] = NetVectors.Read(r, 10, 24);
            values["boneNameIndex"] = r.Bits(8);
            values["hitDirectionRaw"] = new[] { r.Bits(16), r.Bits(16), r.Bits(16) };
            values["impactPointUnresolved"] = NetVectors.Read(r, 10, 24);
            values["impactNormalRaw"] = new[] { r.Bits(16), r.Bits(16), r.Bits(16) };
            values["hitComponentGuid"] = Guid();
            values["damageTakerCombatStateIndex"] = r.Bits(8);
            values["postDamageCombatStateIndex"] = r.Bits(8);
            values["crowdControlVariant"] = r.Bits(2);
            values["newCombatState"] = r.Bits(1) != 0;
            values["inventoryItemGuid"] = Guid();
            values["applyCondition"] = r.Bits(4);
            values["projectileGuid"] = Guid();
            values["locationBasedDamage"] = r.Bits(2);
            values["attachParentGuid"] = Guid();
            values["goreBoneNameIndex"] = r.Bits(8);
            values["goreHeadAction"] = r.Bits(2);
            values["goreLimbAction"] = r.Bits(2);
            values["goreImpulseUnresolved"] = NetVectors.Read(r, 10, 24);
            values["goreFlagsRaw"] = r.Bits(2);
            values["lastFlagsRaw"] = r.Bits(2);
            Optional("invocationId", () => unchecked((int)r.Bits(32)));
        }
        else if (id == 8)
        {
            kind = "healing";
            Optional("amount", () => Number());
            Optional("speed", () => Number());
            Optional("curveGuid", () => Guid());
            Optional("instigatorPlayerStateGuid", () => Guid());
            values["overheal"] = r.Bits(1) != 0;
            Optional("healingSource", () => (int)r.Bits(3));
        }
        else if (id == 9)
        {
            kind = "death";
            Optional("killerGuids", () =>
            {
                var count = (int)r.Bits(16);
                if (count > 256) throw new InvalidDataException("Contributor array bound");
                return Enumerable.Range(0, count).Select(_ => Guid()).ToArray();
            });
            var present = r.Bits(1) != 0;
            values["paramsPresent"] = present;
            if (present)
            {
                values["impactPointUnresolved"] = NetVectors.Read(r, 1, 20);
                values["randomSeedRaw"] = (uint)r.Bits(32);
                values["reasonCode"] = (int)r.Bits(4);
                values["deadCharacterId"] = r.Bits(8);
                values["attachToProjectile"] = r.Bits(1) != 0;
            }
        }
        else return null;
        if (r.Remaining != 0) throw new UnsupportedFieldException("Unknown notification suffix");
        return (kind, values);
    }
}
