export function normalizeNamePart(value: string | null | undefined) {
  return value?.trim().toUpperCase() ?? "";
}

export function buildFullName(lastName: string, firstName: string, middleName?: string | null) {
  const last = normalizeNamePart(lastName);
  const first = normalizeNamePart(firstName);
  const middle = normalizeNamePart(middleName);
  if (!last && !first && !middle) return "";
  const primary = [last, first].filter(Boolean).join(", ");
  return [primary, middle].filter(Boolean).join(" ");
}

export function getProfileDisplayName(profile: {
  full_name?: string | null;
  last_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
}) {
  const built = buildFullName(profile.last_name ?? "", profile.first_name ?? "", profile.middle_name);
  return built || (profile.full_name ?? "");
}

export function getInitials(profile: {
  full_name?: string | null;
  last_name?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
}) {
  const first =
    normalizeNamePart(profile.first_name)?.[0] ??
    normalizeNamePart(profile.full_name)?.[0] ??
    "?";
  const last = normalizeNamePart(profile.last_name)?.[0] ?? "";
  return `${first}${last}`.trim() || "?";
}

export function getFirstName(profile: {
  full_name?: string | null;
  first_name?: string | null;
}) {
  const first = normalizeNamePart(profile.first_name);
  if (first) return first;
  const full = normalizeNamePart(profile.full_name);
  if (!full) return "";
  if (full.includes(",")) {
    const [, rest = ""] = full.split(",", 2);
    return rest.trim().split(/\s+/)[0] ?? "";
  }
  return full.split(/\s+/)[0] ?? "";
}

export function splitStoredName(fullName: string | null | undefined) {
  const full = normalizeNamePart(fullName);
  if (!full) return { lastName: "", firstName: "", middleName: "" };
  if (full.includes(",")) {
    const [last = "", rest = ""] = full.split(",", 2);
    const parts = rest.trim().split(/\s+/).filter(Boolean);
    return {
      lastName: last.trim(),
      firstName: parts[0] ?? "",
      middleName: parts.slice(1).join(" "),
    };
  }
  const parts = full.split(/\s+/).filter(Boolean);
  return {
    lastName: parts.slice(1).join(" "),
    firstName: parts[0] ?? "",
    middleName: "",
  };
}
