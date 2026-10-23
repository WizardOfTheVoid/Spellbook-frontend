namespace SpellBook.Telemetry;

public static class ItemClassification
{
    public static bool IsItemPath(string? path)
    {
        if (path is null) return false;
        if (path.Contains("/Inventory/", StringComparison.Ordinal) || path.Contains("/Interactables/", StringComparison.Ordinal)) return true;
        if (!path.StartsWith("/Game/Maps/", StringComparison.Ordinal) || !path.Contains(".PersistentLevel.", StringComparison.Ordinal)) return false;
        var name = path[(path.LastIndexOf('.') + 1)..];
        return name.StartsWith("Weapon_", StringComparison.Ordinal) || name.StartsWith("WeaponRack_", StringComparison.Ordinal) || name.StartsWith("BaseWeaponRack_", StringComparison.Ordinal);
    }
}
