# بوابة KMK

نظام واحد يجمع برامج شركة KMK: الحضور والانصراف، الموارد البشرية، العهد والنثريات، المهام، العملاء، والمالية.

**الرابط:** https://mhmodahmd.github.io/kmk-portal/
**الحالة:** المرحلة 0 (التأسيس): الدخول، الهيكل، الرئيسية، الموافقات، المستخدمون والأدوار، بيانات الشركة، سجل العمليات.

## الوثائق
| | |
|---|---|
| [01 المعمارية](docs/01-architecture.md) | كيف يُبنى النظام ولماذا |
| [02 نظام التصميم](docs/02-design-system.md) | الهوية والألوان والمكونات |
| [03 الشاشات](docs/03-screens.md) | كل وحدة وشاشاتها |
| [04 نموذج البيانات](docs/04-data-model.md) | الجداول والروابط ونقل البيانات |
| [05 الصلاحيات](docs/05-permissions.md) | من يفعل ماذا |
| [06 خطة المراحل](docs/06-roadmap.md) | ترتيب التنفيذ |

## المجلدات
- `web/` الواجهة (React + TypeScript + Vite + Tailwind)، تُنشر تلقائياً على GitHub Pages عند الدفع إلى `main`.
- `server/` الخادم (Google Apps Script)، يُرفع بـ `clasp`.
- `docs/` الوثائق · `brand/` الشعار.
- `legacy/` نسخة مرجعية من النظامين الحاليين (لا تُرفع إلى GitHub).

## التطوير المحلي
```bash
cd web
npm install
npm run dev:mock      # الواجهة مع خادم وهمي في المتصفح، بلا بيانات حقيقية
```

## الخادم
```bash
cd server
clasp push            # رفع الكود إلى المشروع المرتبط في .clasp.json (غير مرفوع إلى git)
clasp create-deployment --deploymentId <id> --description "..."   # تحديث النشر نفسه
```
- النشر: `Execute as: Me` · `Who has access: Anyone`، والحماية بالجلسة والصلاحية في الخادم.
- ملفات البيانات تُنشأ تلقائياً عند أول طلب، ومعرّفاتها في Script Properties (`DB_CORE` …).
- عنوان الخادم يُضبط في متغير المستودع `API_URL` (Settings › Variables › Actions).
