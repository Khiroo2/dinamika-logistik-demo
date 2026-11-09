(function () {
  'use strict';
  const KEY = 'owner-draft-' + (window.SITE_CONFIG.company.siteKey || 'vector-v2');
  const statuses = { available: 'Доступно', busy: 'Недоступно', confirm: 'По согласованию' };
  function checked(raw, base) {
    if (!raw || raw.version !== 2 || !Array.isArray(raw.vehicles)) throw new Error('Неверный формат настроек.');
    const result = JSON.parse(JSON.stringify(base));
    const str = (value, max) => typeof value === 'string' && value.length <= max;
    if (!raw.company || !str(raw.company.name, 80) || !raw.company.name.trim() || !str(raw.company.region, 160) || !raw.company.region.trim() || !str(raw.company.phone, 80) || !str(raw.company.telegram, 120) || !str(raw.company.hours, 100)) throw new Error('Проверьте данные компании.');
    if (raw.company.phone && !RequestCore.phoneLink(raw.company.phone)) throw new Error('Проверьте телефон компании.');
    if (raw.company.telegram && !RequestCore.telegramLink(raw.company.telegram)) throw new Error('Укажите Telegram: @username, https://t.me/username или https://t.me/+номер.');
    for (const key of ['name','region','phone','telegram','hours']) result.company[key] = raw.company[key].trim();
    if (raw.vehicles.length !== base.vehicles.length || new Set(raw.vehicles.map(v => v.id)).size !== base.vehicles.length) throw new Error('Состав транспорта не совпадает.');
    for (const v of result.vehicles) {
      const change = raw.vehicles.find(item => item.id === v.id);
      if (!change || !Object.hasOwn(statuses, change.availability) || !RequestCore.tariffFor({...change, quoteOnly:false}, base.pricing)) throw new Error('Проверьте ставки, минимальный заказ и статус каждой машины.');
      if (!['hourly','minHours','perKm'].every(key => typeof change.pricing[key] === 'number' && Number.isFinite(change.pricing[key]))) throw new Error('Тарифы должны быть числами.');
      if (change.pricing.hourly > 1000000 || change.pricing.perKm > 100000 || change.pricing.perKm === '' || change.pricing.perKm === null) throw new Error('Проверьте величину тарифа.');
      v.pricing = Object.fromEntries(Object.entries(change.pricing).filter(([k]) => ['hourly','minHours','perKm'].includes(k)).map(([k,val]) => [k, Number(val)]));
      v.availability = change.availability;
      if (change.quoteOnly !== undefined && typeof change.quoteOnly !== 'boolean') throw new Error('Неверный режим стоимости.');
      v.quoteOnly = change.quoteOnly === true;
    }
    const assignText = (target, source, keys) => {
      if (!source) return;
      for (const key of keys) if (source[key] !== undefined) {
        if (!str(source[key], 2000)) throw new Error('Слишком длинный текст.');
        target[key] = source[key].trim();
      }
    };
    const assignImage = (target, source, key) => {
      if (!source || source[key] === undefined) return;
      if (source[key] === '' || source[key] === null) { target[key] = null; return; }
      if (!RequestCore.imagePath(source[key])) throw new Error('Нужна фотография JPG, PNG, WebP, путь assets/ или ссылка HTTPS.');
      target[key] = source[key];
    };
    assignText(result.company, raw.company, ['descriptor','vk']);
    if (result.company.vk && !RequestCore.vkLink(result.company.vk)) throw new Error('Проверьте ссылку ВК.');
    assignImage(result.company, raw.company, 'logo');
    assignText(result.hero, raw.hero, ['title','description','imageAlt']);
    assignImage(result.hero, raw.hero, 'image');
    for (const v of result.vehicles) {
      const change = raw.vehicles.find(item => item.id === v.id);
      assignText(v, change, ['name','description','service','capacity','volume','length','imageAlt']);
      if (!v.name.trim()) throw new Error('Введите название транспорта.');
      assignImage(v, change, 'image');
    }
    if (raw.conditions !== undefined) {
      if (!Array.isArray(raw.conditions) || raw.conditions.length > 10 || !raw.conditions.every(v => str(v, 600))) throw new Error('Не более десяти условий по 600 символов.');
      result.conditions = raw.conditions.map(v => v.trim()).filter(Boolean);
    }
    if (typeof raw.isExample !== 'boolean') throw new Error('Не задан режим тарифов.');
    result.pricing.isExample = raw.isExample;
    return result;
  }
  function snapshot(config) {
    const { name, region, phone, telegram, hours } = config.company;
    return { version: 2, company: { name, region, phone, telegram, hours, vk: config.company.vk || '', descriptor: config.company.descriptor, logo: config.company.logo }, hero: {...config.hero}, conditions: [...config.conditions], isExample: config.pricing.isExample === true, vehicles: config.vehicles.map(v => ({ ...v, pricing: {...v.pricing}, availability: v.availability || 'confirm' })) };
  }
  function toScript(config) { return '/* Настройки сайта. Не храните здесь секреты. */\nwindow.SITE_CONFIG = ' + JSON.stringify(config, null, 2) + ';\n'; }
  window.OwnerSettings = { KEY, statuses, checked, snapshot, toScript };
  if (new URLSearchParams(location.search).get('preview') === '1') {
    try {
      const saved = localStorage.getItem(KEY);
      if (!saved) throw new Error('Сохранённого черновика нет.');
      window.SITE_CONFIG = checked(JSON.parse(saved), window.SITE_CONFIG);
      window.DRAFT_PREVIEW = 'Черновик настроек. Эти изменения ещё не опубликованы.';
    } catch (_) { window.DRAFT_PREVIEW = 'Черновик недоступен. Показаны данные из config.js.'; }
  }
})();
