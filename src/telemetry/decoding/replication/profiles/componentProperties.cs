namespace SpellBook.Telemetry;

public static class ComponentProperties
{
    public static SparseValues Sparse(BitReader reader, Func<object?> read, int maximum = 256)
    {
        var length = (int)reader.Bits(16);
        if (length > maximum) throw new InvalidDataException("Sparse array bound");
        var updates = new List<SparseValue>();
        uint previous = 0;
        for (var index = reader.Packed(); index != 0; index = reader.Packed())
        {
            if (index <= previous || index > length) throw new InvalidDataException("Sparse array order or bound");
            updates.Add(new((int)index - 1, read()));
            previous = index;
        }
        return new(length, updates);
    }

    public static double Half(BitReader reader)
    {
        var value = (double)BitConverter.UInt16BitsToHalf((ushort)reader.Bits(16));
        return double.IsFinite(value) ? value : throw new InvalidDataException("Nonfinite half");
    }

    public static uint Reference(BitReader reader)
    {
        var guid = reader.Packed();
        return guid != 1 ? guid : throw new UnsupportedFieldException("Unobserved inline component reference");
    }

    public static Dictionary<uint, (string Name, Func<object?> Read)> Create(string kind, BitReader r)
    {
        Dictionary<uint, (string Name, Func<object?> Read)> result = [];
        if (kind == "stats")
        {
            result[3] = ("health", () => Half(r));
            result[5] = ("stamina", () => Half(r));
            result[6] = ("statuses", () => Sparse(r, () => r.Bits(1) == 0 ? 0 : (int)(sbyte)r.Bits(8)));
            result[7] = ("allowedDamagingFaction", () => (int)r.Bits(3));
        }
        if (kind == "inventory")
        {
            foreach (uint handle in new uint[] { 3, 4, 5, 7, 8, 9 })
                result[handle] = ($"inventoryLoadout{handle}", () => Reference(r));
            result[10] = ("inventory", () => Sparse(r, () => Reference(r)));
        }
        if (kind == "combat")
        {
            result[1] = ("componentFlag1", () => r.Bits(1) != 0);
            result[3] = ("combatState", () => (int)r.Bits(8));
            result[4] = ("attackIndex", () => (int)r.Bits(8));
            result[5] = ("animationLengthRaw", () => (int)r.Bits(16));
            result[6] = ("emoteId", () => (int)(sbyte)r.Bits(8));
            result[7] = ("attackPropertiesRaw", () => (int)r.Bits(8));
            result[8] = ("itemSlot", () => (int)r.Bits(8));
            var flags = new[] { "altComboState", "isFeint", "isFeintCombo", "isCounter", "isHeavy", "comboFromBlocked", "comboFromDoingParryBreak", "comboFromMissedAttack", "startAttack", "useWeaponTracers", "offHandWeapon" };
            for (uint i = 0; i < flags.Length; i++)
                if (i != 6) result[9 + i] = (flags[i], () => r.Bits(1) != 0);
        }
        return result;
    }
}
