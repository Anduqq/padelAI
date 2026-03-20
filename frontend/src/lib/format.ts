export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "Not yet";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatStatus(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
