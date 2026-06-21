# Safi Web (Next.js)

واجهة الويب: تولّد استمارة من وصف عربي، تعرضها كنموذج حيّ (RTL)، تعبّئها وتحفظها.

## التشغيل
يتطلّب الباك إند يعمل على `http://localhost:8601`.

```bash
cd ~/Documents/Safi/apps/web
npm install
npm run dev          # على المنفذ 3601
```
افتح: http://localhost:3601

## الإعداد
عنوان الباك إند الافتراضي `http://localhost:8601`. لتغييره أنشئ `.env.local`:
```
NEXT_PUBLIC_API_BASE=http://localhost:8601
```

## ملاحظات (v1)
- مدعوم: text, integer, double, date, datetime, time, dropdown, radio, checkbox, note, groupField + المنطق الشرطي (visibilityWhen).
- لاحقاً: map, signature, file, image, matrix, table, repeating الحقيقي، والإسناد للبيانات الساندة.
