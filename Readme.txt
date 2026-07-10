cd C:\1\gamenet-watcher-main
bun install
npm install

npm run dev


http://localhost:8080/



npm run electron:dev


npm run start


وقتی روی سیستم خودت npm run dev می‌زنی:

    داشبورد روی http://localhost:8080/ بالا میاد
    ایجنت پینگ Node خودکار کنارش روی http://localhost:8765 اجرا می‌شه

چون هر دو روی localhost و http هستن، مرورگر بدون مشکل بهشون وصل می‌شه و DNS و گیت‌وی و IPهای داخلی شبکه‌ت با ICMP واقعی عدد درست (مثل ۱۶ms) نشون می‌دن نه loss.

فقط یادت باشه پروژه رو با npm run dev اجرا کنی (نه npm run dev:app)، چون نسخه‌ی کامل هر دو رو با هم بالا میاره. اگه جایی پینگ‌ها loss شد یا پورت ۸۷۶۵ اشغال بود، خبر بده.
