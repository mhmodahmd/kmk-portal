// يضبط الوضع الليلي/النهاري قبل رسم الصفحة لتجنب الوميض
try {
  var t = localStorage.getItem('kmk.theme');
  var dark = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
} catch (e) {
  document.documentElement.dataset.theme = 'light';
}
