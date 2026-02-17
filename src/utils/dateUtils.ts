/**
 * Format a date string without timezone conversion
 * Handles dates stored as "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm:ss.sssZ"
 */
export function formatDateLocal(dateString: string): string {
  if (!dateString) return '';
  
  // If it's just a date string (YYYY-MM-DD), parse it as local date
  if (dateString.length === 10 && dateString.includes('-')) {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString();
  }
  
  // Otherwise, it's an ISO string, use normal parsing
  return new Date(dateString).toLocaleDateString();
}

/**
 * Format a date string with custom options without timezone conversion
 */
export function formatDateLocalWithOptions(
  dateString: string,
  options: Intl.DateTimeFormatOptions
): string {
  if (!dateString) return '';
  
  // If it's just a date string (YYYY-MM-DD), parse it as local date
  if (dateString.length === 10 && dateString.includes('-')) {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', options);
  }
  
  // Otherwise, it's an ISO string, use normal parsing
  return new Date(dateString).toLocaleDateString('en-US', options);
}
