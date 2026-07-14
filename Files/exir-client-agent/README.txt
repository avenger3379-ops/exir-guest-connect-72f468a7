Unblock-File -Path "C:\ExirClientAgent\install-service.ps1"
Unblock-File -Path "C:\ExirClientAgent\run-agent.ps1"
powershell -NoExit -ExecutionPolicy Bypass -File "C:\ExirClientAgent\install-service.ps1"


۶. تست IP درست همون ماشین (نه یه IP کپی‌شده از راهنما)
اول IP واقعی خودِ اون ماشین رو بگیر:
ipconfig | findstr /C:"IPv4"

بعد با همون IP تست کن (نه با 192.168.3.101 ثابت از دستورالعمل اولیه):
powershellcurl http://192.168.3.110:8766/health
باید ببینی: "ok":true و "machine":"VIPxx" با نامی که مطابق همون سیستم باشه.


 تأیید نهایی: بدون پنجره + Task سالم

مطمئن شو هیچ پنجره‌ی سیاه cmd باز نمونده روی صفحه
چک کن Task درست ثبت شده:

schtasks /Query /TN ExirClientAgent /V /FO LIST | findstr "Result"
باید Last Result: 0 باشه.