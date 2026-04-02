/**
 * DateTime utility for formatting dates.
 * Ported from DCMS FormatTime — pure utility, no DOM dependency.
 *
 * Features:
 * - Absolute time formatting with custom tokens (DD/MM/YYYY/HH/mm/ss/A/a/hh/YY)
 * - Relative time in Vietnamese ("Vừa xong", "X phút trước", "Hơn X giờ trước")
 * - ISO conversion from formatted date strings
 *
 * @example
 * TdDateTime.toAbsolute('2025-08-12T04:36:00Z', 'DD/MM/YYYY - HH:mm')
 * TdDateTime.toRelative('2025-08-12T04:36:00Z') // "3 tháng trước"
 * TdDateTime.toISO('12/08/2025 - 11:36', 'DD/MM/YYYY - HH:mm')
 */
export class TdDateTime {
  /**
   * Parse input date (ISO string, Unix timestamp, or Date object) to Date object.
   * @param {string|number|Date} input - Date input
   * @returns {Date|null} Parsed Date object or null if invalid
   */
  static _parseDate(input) {
    if (!input) return null;

    // Already a Date object
    if (input instanceof Date) {
      return isNaN(input.getTime()) ? null : input;
    }

    // Unix timestamp (number in seconds or milliseconds)
    if (typeof input === 'number') {
      const timestamp = input < 1e12 ? input * 1000 : input;
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? null : date;
    }

    // String input
    if (typeof input === 'string') {
      // Try ISO string first
      const isoDate = new Date(input);
      if (!isNaN(isoDate.getTime())) {
        return isoDate;
      }

      // Try Unix timestamp string
      const numInput = Number(input);
      if (!isNaN(numInput)) {
        const timestamp = numInput < 1e12 ? numInput * 1000 : numInput;
        const date = new Date(timestamp);
        return isNaN(date.getTime()) ? null : date;
      }
    }

    return null;
  }

  /**
   * Pad number with leading zeros.
   * @param {number} num - Number to pad
   * @param {number} length - Target length (default 2)
   * @returns {string} Padded string
   */
  static _pad(num, length = 2) {
    return String(num).padStart(length, '0');
  }

  /**
   * Format date to absolute time string.
   * @param {string|number|Date} dateInput - Date input (ISO string, Unix timestamp, or Date object)
   * @param {string} format - Format string (default: 'DD/MM/YYYY - HH:mm')
   *   Supported tokens:
   *   - DD: Day (01-31)
   *   - MM: Month (01-12)
   *   - YYYY: Full year (2025)
   *   - YY: 2-digit year (25)
   *   - HH: 24-hour format (00-23)
   *   - hh: 12-hour format (01-12)
   *   - mm: Minutes (00-59)
   *   - ss: Seconds (00-59)
   *   - A: AM/PM (uppercase)
   *   - a: am/pm (lowercase)
   * @returns {string} Formatted date string or empty string if invalid
   */
  static toAbsolute(dateInput, format = 'DD/MM/YYYY - HH:mm') {
    const date = TdDateTime._parseDate(dateInput);
    if (!date) return '';

    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const hours24 = date.getHours();
    const hours12 = hours24 === 0 ? 12 : (hours24 > 12 ? hours24 - 12 : hours24);
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const ampm = hours24 >= 12 ? 'PM' : 'AM';
    const ampmLower = ampm.toLowerCase();

    // Replace tokens in order (longest first to avoid partial matches)
    let result = format;
    result = result.replace(/YYYY/g, String(year));
    result = result.replace(/YY/g, String(year).slice(-2));
    result = result.replace(/MM/g, TdDateTime._pad(month));
    result = result.replace(/DD/g, TdDateTime._pad(day));
    result = result.replace(/HH/g, TdDateTime._pad(hours24));
    result = result.replace(/hh/g, TdDateTime._pad(hours12));
    result = result.replace(/mm/g, TdDateTime._pad(minutes));
    result = result.replace(/ss/g, TdDateTime._pad(seconds));
    result = result.replace(/A/g, ampm);
    result = result.replace(/a/g, ampmLower);

    return result;
  }

  /**
   * Format date to relative time string (Vietnamese).
   * @param {string|number|Date} dateInput - Date input
   * @returns {string} Relative time string (e.g., "Vừa xong", "5 phút trước")
   */
  static toRelative(dateInput) {
    const date = TdDateTime._parseDate(dateInput);
    if (!date) return '';

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    // Less than 1 minute
    if (diffSeconds < 60) {
      return 'Vừa xong';
    }

    // Minutes
    if (diffMinutes < 60) {
      return `${diffMinutes} phút trước`;
    }

    // Hours
    if (diffHours < 24) {
      const hours = Math.floor(diffHours);
      const minutesInCurrentHour = diffMinutes % 60;
      if (minutesInCurrentHour >= 30) {
        return `Hơn ${hours} giờ trước`;
      }
      return `${hours} giờ trước`;
    }

    // Days
    if (diffDays < 30) {
      const days = Math.floor(diffDays);
      const hoursInCurrentDay = diffHours % 24;
      if (hoursInCurrentDay >= 12) {
        return `Hơn ${days} ngày trước`;
      }
      return `${days} ngày trước`;
    }

    // Months
    if (diffMonths < 12) {
      const months = Math.floor(diffMonths);
      const daysInCurrentMonth = diffDays % 30;
      if (daysInCurrentMonth >= 15) {
        return `Hơn ${months} tháng trước`;
      }
      return `${months} tháng trước`;
    }

    // Years
    const years = Math.floor(diffYears);
    const monthsInCurrentYear = diffMonths % 12;
    if (monthsInCurrentYear >= 6) {
      return `Hơn ${years} năm trước`;
    }
    return `${years} năm trước`;
  }

  /**
   * Convert date with mode option (wrapper method).
   * @param {string|number|Date} dateInput - Date input
   * @param {Object} options
   * @param {string} options.mode - 'absolute' or 'relative' (default: 'absolute')
   * @param {string} options.format - Format string for absolute mode
   * @returns {string} Formatted date string
   */
  static convert(dateInput, options = {}) {
    const { mode = 'absolute', format = 'DD/MM/YYYY - HH:mm' } = options;

    if (mode === 'relative') {
      return TdDateTime.toRelative(dateInput);
    }

    return TdDateTime.toAbsolute(dateInput, format);
  }

  /**
   * Convert formatted date string back to ISO 8601 format.
   * @param {string} formattedDate - Formatted date string (e.g., "12/08/2025 - 11:36")
   * @param {string} inputFormat - Format of input string (default: 'DD/MM/YYYY - HH:mm')
   * @returns {string} ISO 8601 string or empty string if invalid
   */
  static toISO(formattedDate, inputFormat = 'DD/MM/YYYY - HH:mm') {
    if (!formattedDate || typeof formattedDate !== 'string') return '';

    try {
      // Build regex pattern and track token order
      let regexPattern = '';
      const tokenOrder = [];
      let i = 0;

      while (i < inputFormat.length) {
        if (inputFormat.substr(i, 4) === 'YYYY') {
          regexPattern += '(\\d{4})';
          tokenOrder.push({ type: 'YYYY', index: tokenOrder.length + 1 });
          i += 4;
        } else if (inputFormat.substr(i, 2) === 'DD') {
          regexPattern += '(\\d{1,2})';
          tokenOrder.push({ type: 'DD', index: tokenOrder.length + 1 });
          i += 2;
        } else if (inputFormat.substr(i, 2) === 'MM') {
          regexPattern += '(\\d{1,2})';
          tokenOrder.push({ type: 'MM', index: tokenOrder.length + 1 });
          i += 2;
        } else if (inputFormat.substr(i, 2) === 'YY') {
          regexPattern += '(\\d{2})';
          tokenOrder.push({ type: 'YY', index: tokenOrder.length + 1 });
          i += 2;
        } else if (inputFormat.substr(i, 2) === 'HH') {
          regexPattern += '(\\d{1,2})';
          tokenOrder.push({ type: 'HH', index: tokenOrder.length + 1 });
          i += 2;
        } else if (inputFormat.substr(i, 2) === 'hh') {
          regexPattern += '(\\d{1,2})';
          tokenOrder.push({ type: 'hh', index: tokenOrder.length + 1 });
          i += 2;
        } else if (inputFormat.substr(i, 2) === 'mm') {
          regexPattern += '(\\d{1,2})';
          tokenOrder.push({ type: 'mm', index: tokenOrder.length + 1 });
          i += 2;
        } else if (inputFormat.substr(i, 2) === 'ss') {
          regexPattern += '(\\d{1,2})';
          tokenOrder.push({ type: 'ss', index: tokenOrder.length + 1 });
          i += 2;
        } else if (inputFormat[i] === 'A' || inputFormat[i] === 'a') {
          regexPattern += '(AM|PM|am|pm)';
          tokenOrder.push({ type: inputFormat[i], index: tokenOrder.length + 1 });
          i += 1;
        } else {
          const char = inputFormat[i];
          regexPattern += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          i += 1;
        }
      }

      const match = formattedDate.match(new RegExp('^' + regexPattern + '$'));
      if (!match) return '';

      // Extract values based on token order
      let day = null, month = null, year = null, hours = null, minutes = null, seconds = 0, ampm = null;

      tokenOrder.forEach(token => {
        const value = match[token.index];
        if (!value) return;

        switch (token.type) {
          case 'DD':
            day = parseInt(value, 10);
            break;
          case 'MM':
            month = parseInt(value, 10);
            break;
          case 'YYYY':
            year = parseInt(value, 10);
            break;
          case 'YY': {
            const yy = parseInt(value, 10);
            year = yy < 50 ? 2000 + yy : 1900 + yy;
            break;
          }
          case 'HH':
            hours = parseInt(value, 10);
            break;
          case 'hh':
            hours = parseInt(value, 10);
            break;
          case 'mm':
            minutes = parseInt(value, 10);
            break;
          case 'ss':
            seconds = parseInt(value, 10);
            break;
          case 'A':
          case 'a':
            ampm = value.toUpperCase();
            break;
        }
      });

      // Validate required fields
      if (day === null || month === null || year === null || hours === null || minutes === null) {
        return '';
      }

      // Handle 12-hour format with AM/PM
      if (ampm) {
        if (ampm === 'PM' && hours < 12) {
          hours += 12;
        } else if (ampm === 'AM' && hours === 12) {
          hours = 0;
        }
      }

      // Validate ranges
      if (day < 1 || day > 31 || month < 1 || month > 12 ||
          hours < 0 || hours > 23 || minutes < 0 || minutes > 59 ||
          seconds < 0 || seconds > 59) {
        return '';
      }

      // Create Date object in local timezone
      const localDate = new Date(year, month - 1, day, hours, minutes, seconds);

      // Validate date (e.g., Feb 30 is invalid)
      if (localDate.getFullYear() !== year ||
          localDate.getMonth() !== month - 1 ||
          localDate.getDate() !== day ||
          localDate.getHours() !== hours ||
          localDate.getMinutes() !== minutes) {
        return '';
      }

      return localDate.toISOString();
    } catch (error) {
      return '';
    }
  }
}
