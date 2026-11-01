# صاحبي القرآن · Sahibi Al-Quran

تطبيق مجاني (صدقة جارية) لورد مراجعة وحفظ القرآن للأطفال: توزيع تلقائي للمراجعة، نجوم ومكافآت، سجل تقدم، وجانب لمعلم الحلقة.

- `src/` كود التطبيق، يبنيه `build.py` إلى `dist/public`
- `firestore.rules` قواعد الأمان
- `jobs/reminders.js` التذكير اليومي وملخص المعلم (يعمل على GitHub Actions كل 15 دقيقة)
- `.github/workflows/deploy.yml` ينشر التطبيق على Firebase Hosting عند كل تحديث

يحتاج Secret واحدًا في المستودع: `FIREBASE_SERVICE_ACCOUNT` (مفتاح حساب الخدمة من Firebase).
