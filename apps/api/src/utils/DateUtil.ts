// Path: backend/src/utils/DateUtil.ts
export interface ThaiDateOptions {
    includeWeekday?: boolean;
    includeTime?: boolean;
    format?: 'short' | 'long' | 'full';
    useThaiNumerals?: boolean;
    showEra?: boolean;
}

export interface ThaiDateParseOptions {
    assumeBuddhistEra?: boolean;
}

export type DateLocale = 'th-TH' | 'en-US';
export type CalendarType = 'buddhist' | 'gregory';
export type DateRangePeriod = '7days' | '30days' | '3months' | '1year';

class DateUtil {
    /**
     * แปลงปีจากคริสต์ศักราชเป็นพุทธศักราช
     */
    static gregorianToBuddhist(gregorianYear: number): number {
        return gregorianYear + 543;
    }

    /**
     * แปลงปีจากพุทธศักราชเป็นคริสต์ศักราช
     */
    static buddhistToGregorian(buddhistYear: number): number {
        return buddhistYear - 543;
    }

    /**
     * ได้ปีพุทธศักราชปัจจุบัน
     */
    static getCurrentBuddhistYear(): number {
        return this.gregorianToBuddhist(new Date().getFullYear());
    }

    /**
     * แปลง Date object เป็นรูปแบบวันที่ไทย
     */
    static formatThaiDate(date: Date, options: ThaiDateOptions = {}): string {
        const {
            includeWeekday = false,
            includeTime = false,
            format = 'long',
            useThaiNumerals = false,
            showEra = true
        } = options;

        let formatOptions: Intl.DateTimeFormatOptions = {
            calendar: 'buddhist',
            year: 'numeric',
            day: 'numeric'
        };

        // กำหนดรูปแบบเดือน
        switch (format) {
            case 'short':
                formatOptions.month = 'numeric';
                break;
            case 'long':
                formatOptions.month = 'long';
                break;
            case 'full':
                formatOptions.month = 'long';
                formatOptions.weekday = 'long';
                break;
        }

        // เพิ่มวันในสัปดาห์
        if (includeWeekday || format === 'full') {
            formatOptions.weekday = 'long';
        }

        // เพิ่มเวลา
        if (includeTime) {
            formatOptions.hour = 'numeric';
            formatOptions.minute = 'numeric';
            formatOptions.second = 'numeric';
            formatOptions.hour12 = false;
        }

        // ใช้เลขไทย
        if (useThaiNumerals) {
            formatOptions.numberingSystem = 'thai';
        }

        const formatter = new Intl.DateTimeFormat('th-TH', formatOptions);
        let result = formatter.format(date);

        // เพิ่ม/ลบ พ.ศ. ตามต้องการ
        if (!showEra && result.includes('พ.ศ.')) {
            result = result.replace(/พ\.ศ\.\s?/, '');
        }

        return result;
    }

    /**
     * แปลงวันที่เป็นรูปแบบสั้น (dd/mm/yyyy)
     */
    static toShortThaiDate(date: Date, useThaiNumerals: boolean = false): string {
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = this.gregorianToBuddhist(date.getFullYear());

        if (useThaiNumerals) {
            return this.convertToThaiNumerals(`${day}/${month}/${year}`);
        }

        return `${day}/${month}/${year}`;
    }

    /**
     * แปลงตัวเลขอารบิกเป็นเลขไทย
     */
    static convertToThaiNumerals(text: string): string {
        const arabicToThai: Record<string, string> = {
            '0': '๐', '1': '๑', '2': '๒', '3': '๓', '4': '๔',
            '5': '๕', '6': '๖', '7': '๗', '8': '๘', '9': '๙'
        };

        return text.replace(/[0-9]/g, (digit) => arabicToThai[digit] || digit);
    }

    /**
     * แปลงเลขไทยเป็นตัวเลขอารบิก
     */
    static convertFromThaiNumerals(text: string): string {
        const thaiToArabic: Record<string, string> = {
            '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
            '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9'
        };

        return text.replace(/[๐-๙]/g, (digit) => thaiToArabic[digit] || digit);
    }

    /**
     * สร้าง Date object จากวันที่พุทธศักราช
     */
    static createFromBuddhistDate(day: number, month: number, buddhistYear: number): Date {
        const gregorianYear = this.buddhistToGregorian(buddhistYear);
        return new Date(gregorianYear, month - 1, day);
    }

    /**
     * แปลงสตริงวันที่ไทยเป็น Date object
     */
    static parseThaiDate(dateString: string, options: ThaiDateParseOptions = {}): Date | null {
        const { assumeBuddhistEra = true } = options;

        try {
            // แปลงเลขไทยเป็นเลขอารบิกก่อน
            let normalizedString = this.convertFromThaiNumerals(dateString);

            // รูปแบบ dd/mm/yyyy หรือ d/m/yyyy
            const shortDateMatch = normalizedString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (shortDateMatch) {
                const [, day, month, year] = shortDateMatch;
                const gregorianYear = assumeBuddhistEra && parseInt(year) > 2400
                    ? this.buddhistToGregorian(parseInt(year))
                    : parseInt(year);

                return new Date(gregorianYear, parseInt(month) - 1, parseInt(day));
            }

            // รูปแบบยาว เช่น "22 มิถุนายน พ.ศ. 2568"
            const longDateMatch = normalizedString.match(/(\d{1,2})\s+(\S+)\s+(?:พ\.ศ\.\s+)?(\d{4})/);
            if (longDateMatch) {
                const [, day, monthName, year] = longDateMatch;
                const monthIndex = this.getMonthIndex(monthName);

                if (monthIndex !== -1) {
                    const gregorianYear = assumeBuddhistEra && parseInt(year) > 2400
                        ? this.buddhistToGregorian(parseInt(year))
                        : parseInt(year);

                    return new Date(gregorianYear, monthIndex, parseInt(day));
                }
            }

            return null;
        } catch (error) {
            return null;
        }
    }

    /**
     * หาดัชนีเดือนจากชื่อเดือนไทย
     */
    private static getMonthIndex(monthName: string): number {
        const months: Record<string, number> = {
            'มกราคม': 0, 'กุมภาพันธ์': 1, 'มีนาคม': 2, 'เมษายน': 3,
            'พฤษภาคม': 4, 'มิถุนายน': 5, 'กรกฎาคม': 6, 'สิงหาคม': 7,
            'กันยายน': 8, 'ตุลาคม': 9, 'พฤศจิกายน': 10, 'ธันวาคม': 11,
            // รูปแบบสั้น
            'ม.ค.': 0, 'ก.พ.': 1, 'มี.ค.': 2, 'เม.ย.': 3,
            'พ.ค.': 4, 'มิ.ย.': 5, 'ก.ค.': 6, 'ส.ค.': 7,
            'ก.ย.': 8, 'ต.ค.': 9, 'พ.ย.': 10, 'ธ.ค.': 11
        };

        return months[monthName] ?? -1;
    }

    /**
     * คำนวณอายุเป็นปีพุทธศักราช
     */
    static calculateAge(birthDate: Date, referenceDate: Date = new Date()): {
        years: number;
        months: number;
        days: number;
        buddhistYears: number;
    } {
        let years = referenceDate.getFullYear() - birthDate.getFullYear();
        let months = referenceDate.getMonth() - birthDate.getMonth();
        let days = referenceDate.getDate() - birthDate.getDate();

        if (days < 0) {
            months--;
            const lastMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);
            days += lastMonth.getDate();
        }

        if (months < 0) {
            years--;
            months += 12;
        }

        return {
            years,
            months,
            days,
            buddhistYears: this.gregorianToBuddhist(years)
        };
    }

    /**
     * ตรวจสอบว่าเป็นวันหยุดราชการไทยหรือไม่
     */
    static isThaiPublicHoliday(date: Date): boolean {
        const month = date.getMonth() + 1;
        const day = date.getDate();

        // วันหยุดประจำปีที่วันที่คงที่
        const fixedHolidays = [
            { month: 1, day: 1 },   // วันขึ้นปีใหม่
            { month: 4, day: 6 },   // วันจักรี
            { month: 5, day: 1 },   // วันแรงงาน
            { month: 5, day: 4 },   // วันฉัตรมงคล
            { month: 7, day: 28 },  // วันเฉลิมพระชนมพรรษา
            { month: 8, day: 12 },  // วันแม่
            { month: 10, day: 13 }, // วันคล้ายวันสวรรคต
            { month: 10, day: 23 }, // วันปิยมหาราช
            { month: 12, day: 5 },  // วันพ่อ
            { month: 12, day: 10 }, // วันรัฐธรรมนูญ
            { month: 12, day: 31 }  // วันสิ้นปี
        ];

        return fixedHolidays.some(holiday =>
            holiday.month === month && holiday.day === day
        );
    }

    /**
     * หาวันจันทร์แรกและวันศุกร์สุดท้ายของสัปดาห์
     */
    static getWeekRange(date: Date): { start: Date; end: Date } {
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // วันจันทร์

        const start = new Date(date);
        start.setDate(diff);
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    }

    /**
     * หาวันแรกและวันสุดท้ายของเดือน
     */
    static getMonthRange(date: Date): { start: Date; end: Date } {
        const start = new Date(date.getFullYear(), date.getMonth(), 1);
        const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    }

    /**
     * เพิ่มจำนวนวันให้กับวันที่ที่กำหนด
     */
    static addDays(date: Date, days: number): Date {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }

    /**
     * แปลง Date เป็น yyyy-MM-dd (ISO date string)
     */
    static toISODateString(date: Date): string {
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    /**
     * แปลง Date เป็น ISO string มาตรฐาน (UTC)
     */
    static toISOString(date: Date = new Date()): string {
        return date.toISOString();
    }

    /**
     * คืนช่วงวันที่ตาม period ที่ใช้ในรายงาน
     */
    static getDateRange(period: DateRangePeriod): { start: Date; end: Date } {
        const end = new Date();
        const start = new Date(end);

        switch (period) {
            case '7days':
                start.setDate(end.getDate() - 6);
                break;
            case '30days':
                start.setDate(end.getDate() - 29);
                break;
            case '3months':
                start.setMonth(end.getMonth() - 3);
                break;
            case '1year':
                start.setFullYear(end.getFullYear() - 1);
                break;
            default:
                start.setDate(end.getDate() - 29);
                break;
        }

        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    }

    /**
     * แปลงเวลาเป็น ISO string ตามเวลาไทย (Asia/Bangkok)
     */
    static toBangkokISOString(date: Date = new Date()): string {
        const formatter = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Bangkok',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        const parts = formatter.formatToParts(date);
        const get = (type: string): string => parts.find(part => part.type === type)?.value ?? '';
        const ms = String(date.getMilliseconds()).padStart(3, '0');
        return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}.${ms}+07:00`;
    }
}

// ฟังก์ชัน helper สำหรับใช้งานง่าย
export const thaiDate = {
    /**
     * แปลงวันที่ปัจจุบันเป็นรูปแบบไทย
     */
    now: (options?: ThaiDateOptions): string => {
        return DateUtil.formatThaiDate(new Date(), options);
    },

    /**
     * แปลง Date เป็นรูปแบบไทย
     */
    format: (date: Date, options?: ThaiDateOptions): string => {
        return DateUtil.formatThaiDate(date, options);
    },

    /**
     * แปลงเป็นรูปแบบสั้น
     */
    short: (date: Date = new Date(), useThaiNumerals?: boolean): string => {
        return DateUtil.toShortThaiDate(date, useThaiNumerals);
    },

    /**
     * ได้ปีพุทธศักราชปัจจุบัน
     */
    currentYear: (): number => {
        return DateUtil.getCurrentBuddhistYear();
    },

    /**
     * แปลงปี
     */
    year: {
        toBuddhist: (gregorianYear: number): number =>
            DateUtil.gregorianToBuddhist(gregorianYear),
        toGregorian: (buddhistYear: number): number =>
            DateUtil.buddhistToGregorian(buddhistYear)
    },

    /**
     * แปลงตัวเลข
     */
    numerals: {
        toThai: (text: string): string => DateUtil.convertToThaiNumerals(text),
        toArabic: (text: string): string => DateUtil.convertFromThaiNumerals(text)
    },

    /**
     * แปลงสตริงเป็น Date
     */
    parse: (dateString: string, options?: ThaiDateParseOptions): Date | null => {
        return DateUtil.parseThaiDate(dateString, options);
    },

    /**
     * เวลาไทยในรูปแบบ ISO string
     */
    isoBangkok: (date: Date = new Date()): string => {
        return DateUtil.toBangkokISOString(date);
    },

    /**
     * ISO string มาตรฐาน (UTC)
     */
    iso: (date: Date = new Date()): string => {
        return DateUtil.toISOString(date);
    }
};

export default DateUtil
