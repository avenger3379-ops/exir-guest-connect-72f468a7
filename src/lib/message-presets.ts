// Ready-made message templates for the "Send Message" composer — click one
// to instantly fill in the text, countdown, auto-close, and buttons. The
// admin can still edit anything afterwards before sending.

export interface MessagePreset {
  id: string;
  label: string; // shown on the chip
  text: string;
  countdownOn: boolean;
  countdownMin: number;
  countdownLabel: string;
  autoCloseOn: boolean;
  autoCloseSec: number;
  btn1: string;
  secondBtnOn: boolean;
  btn2: string;
}

export const MESSAGE_PRESETS: MessagePreset[] = [
  {
    id: "shutdown-5",
    label: "خاموش شدن ۵ دقیقه‌ای",
    text: "توجه: سیستم شما تا ۵ دقیقه دیگر خاموش خواهد شد. لطفاً بازی و اطلاعات خود را ذخیره کنید.",
    countdownOn: true,
    countdownMin: 5,
    countdownLabel: "تا خاموش شدن سیستم",
    autoCloseOn: false,
    autoCloseSec: 10,
    btn1: "باشه",
    secondBtnOn: true,
    btn2: "بعداً یادآوری کن",
  },
  {
    id: "restart-update",
    label: "ری‌استارت برای بروزرسانی",
    text: "سیستم برای نصب بروزرسانی نیاز به ری‌استارت دارد. لطفاً کار خود را ذخیره کنید.",
    countdownOn: true,
    countdownMin: 2,
    countdownLabel: "تا ری‌استارت سیستم",
    autoCloseOn: false,
    autoCloseSec: 10,
    btn1: "باشه",
    secondBtnOn: false,
    btn2: "",
  },
  {
    id: "time-ending",
    label: "پایان اعتبار/زمان",
    text: "اعتبار بازی شما رو به اتمام است. برای شارژ مجدد به پذیرش مراجعه کنید.",
    countdownOn: false,
    countdownMin: 5,
    countdownLabel: "تا پایان زمان",
    autoCloseOn: false,
    autoCloseSec: 10,
    btn1: "باشه",
    secondBtnOn: false,
    btn2: "",
  },
  {
    id: "break-time",
    label: "زمان استراحت",
    text: "پیشنهاد می‌کنیم چند دقیقه استراحت کنید و از چشمان خود مراقبت کنید 🎮",
    countdownOn: false,
    countdownMin: 5,
    countdownLabel: "تا پایان زمان",
    autoCloseOn: true,
    autoCloseSec: 12,
    btn1: "باشه",
    secondBtnOn: false,
    btn2: "",
  },
  {
    id: "rules-reminder",
    label: "یادآوری قوانین",
    text: "لطفاً قوانین گیم‌نت را رعایت کنید: عدم استفاده از غذا و نوشیدنی کنار سیستم و رعایت احترام نسبت به سایر کاربران. با تشکر 🙏",
    countdownOn: false,
    countdownMin: 5,
    countdownLabel: "تا پایان زمان",
    autoCloseOn: false,
    autoCloseSec: 10,
    btn1: "متوجه شدم",
    secondBtnOn: false,
    btn2: "",
  },
  {
    id: "behavior-warning",
    label: "هشدار رفتار نامناسب",
    text: "لطفاً به سایر کاربران احترام بگذارید. در صورت تکرار رفتار نامناسب، دسترسی شما محدود خواهد شد.",
    countdownOn: false,
    countdownMin: 5,
    countdownLabel: "تا پایان زمان",
    autoCloseOn: false,
    autoCloseSec: 10,
    btn1: "متوجه شدم",
    secondBtnOn: false,
    btn2: "",
  },
  {
    id: "tournament",
    label: "دعوت به تورنومنت",
    text: "🏆 امشب ساعت ۲۱ تورنومنت با جوایز نقدی برگزار می‌شود! برای ثبت‌نام به پذیرش مراجعه کنید.",
    countdownOn: false,
    countdownMin: 5,
    countdownLabel: "تا پایان زمان",
    autoCloseOn: false,
    autoCloseSec: 10,
    btn1: "ثبت‌نام می‌کنم",
    secondBtnOn: true,
    btn2: "بعداً",
  },
  {
    id: "welcome",
    label: "خوش‌آمدگویی",
    text: "به گیم‌نت ما خوش آمدید! برای هرگونه سوال یا مشکل فنی، پذیرش همیشه در دسترس شماست.",
    countdownOn: false,
    countdownMin: 5,
    countdownLabel: "تا پایان زمان",
    autoCloseOn: true,
    autoCloseSec: 8,
    btn1: "باشه",
    secondBtnOn: false,
    btn2: "",
  },
];
