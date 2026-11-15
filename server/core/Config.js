/**
 * إعدادات النظام الثابتة.
 * لا معرّفات ملفات ولا أسرار هنا: تلك في Script Properties.
 */
var APP = {
  NAME: 'بوابة KMK',
  VERSION: '0.9.0',
  // أقدم إصدار واجهة مسموح به. الواجهة الأقدم تُطلب منها إعادة التحميل.
  MIN_CLIENT: '0.1.0',
  TZ: 'Asia/Kuwait',
  SESSION_SECONDS: 21600,      // 6 ساعات (أقصى مدة لـ CacheService)
  DEVICE_DAYS: 30,             // «تذكّرني على هذا الجهاز»
  MAX_FAILED_LOGINS: 5,
  LOCK_MINUTES: 15,
  PASSWORD_MIN: 8,
  // مصادر الواجهة المعتمدة لبصمة الجهاز (localhost مسموح للتطوير). مصادر إضافية: WEB_ORIGINS في Script Properties
  WEB_ORIGINS: ['https://mhmodahmd.github.io'],
  // رابط الواجهة في رسائل البريد
  WEB_URL: 'https://mhmodahmd.github.io/kmk-portal/'
};

/**
 * الوحدات وأدوارها. enabled=false تعني أنها لم تُبنَ بعد (تظهر «قريباً»)
 * لكن يمكن إسناد أدوارها مسبقاً.
 */
var MODULES = [
  { key: 'attendance', label: 'الحضور والانصراف', enabled: true,
    roles: { employee: 'موظف', viewer: 'مشاهد', hr: 'الموارد البشرية' } },
  { key: 'hr', label: 'الموارد البشرية', enabled: true,
    roles: { employee: 'موظف', hr: 'الموارد البشرية' } },
  { key: 'custody', label: 'العهد والنثريات', enabled: true,
    roles: { holder: 'صاحب عهدة', accountant: 'محاسب' } },
  // defaultRole: يملكه كل مستخدم ما لم يُسند له دور آخر
  { key: 'tasks', label: 'المهام', enabled: true, defaultRole: 'member',
    roles: { member: 'عضو', manager: 'مدير مهام' } },
  { key: 'crm', label: 'العملاء', enabled: true,
    roles: { sales: 'مبيعات', accountant: 'محاسب', manager: 'مدير مبيعات' } },
  { key: 'finance', label: 'المالية', enabled: false,
    roles: { viewer: 'مشاهد', accountant: 'محاسب', fmanager: 'مدير مالي' } }
];

function moduleDef_(key) {
  for (var i = 0; i < MODULES.length; i++) if (MODULES[i].key === key) return MODULES[i];
  return null;
}
