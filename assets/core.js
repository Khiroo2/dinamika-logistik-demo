(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RequestCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const limits = { from: 180, to: 180, cargo: 600, comment: 1000, contact: 120 };
  function localToday(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
  function normalize(values) {
    const result = {};
    for (const key of ['vehicle', 'from', 'to', 'date', 'cargo', 'comment', 'contact', 'hours', 'zone', 'distance', 'time']) {
      result[key] = String(values[key] || '').replace(/\r\n?/g, '\n').trim();
    }
    return result;
  }
  function isRealDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function validate(values, vehicles, today = localToday(), rules = {}) {
    const data = normalize(values);
    const errors = {};
    const vehicle = vehicles.find(v => v.id === data.vehicle);
    if (!vehicle) errors.vehicle = 'Выберите транспорт для перевозки.';
    else if (vehicle.availability === 'busy') errors.vehicle = 'Эта машина занята. Выберите другой вариант.';
    if (data.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time)) errors.time = 'Укажите время в формате ЧЧ:ММ.';
    if (!data.from) errors.from = 'Укажите адрес отправления.';
    if (!data.to && !vehicle?.onSite) errors.to = 'Укажите адрес назначения.';
    if (!data.date) errors.date = 'Выберите желаемую дату.';
    else if (!isRealDate(data.date)) errors.date = 'Проверьте дату перевозки.';
    else if (data.date < today) errors.date = 'Выберите сегодня или будущую дату.';
    if (!data.cargo) errors.cargo = 'Расскажите, что нужно перевезти.';
    for (const [key, max] of Object.entries(limits)) {
      if (data[key].length > max) errors[key] = `Сократите текст до ${max} символов.`;
    }
    Object.assign(errors, pricingInput(data, vehicle, rules).errors);
    return { data, errors, valid: Object.keys(errors).length === 0 };
  }
  function pricingLimits(rules = {}) {
    return {
      maxHours: Number.isFinite(rules.maxHours) && rules.maxHours > 0 ? rules.maxHours : 24,
      hourStep: Number.isFinite(rules.hourStep) && rules.hourStep > 0 ? rules.hourStep : 0.5,
      maxDistance: Number.isFinite(rules.maxDistance) && rules.maxDistance > 0 ? rules.maxDistance : 2000,
      roundTrip: rules.roundTrip !== false
    };
  }
  function numeric(value) {
    const text = String(value ?? '').trim();
    return /^-?\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : NaN;
  }
  function onStep(value, step) { return Math.abs(value / step - Math.round(value / step)) < 0.000001; }
  function tariffFor(vehicle, rules = {}) {
    if (vehicle?.quoteOnly === true) return null;
    const price = vehicle && vehicle.pricing;
    if (!price) return null;
    const tariff = { hourly: Number(price.hourly), minHours: Number(price.minHours), perKm: Number(price.perKm) };
    const settings = pricingLimits(rules);
    if (!Object.values(tariff).every(Number.isFinite) || tariff.hourly <= 0 || tariff.minHours <= 0 || tariff.minHours > settings.maxHours || tariff.perKm < 0 || !onStep(tariff.minHours, settings.hourStep)) return null;
    return tariff;
  }
  function pricingInput(data, vehicle, rules = {}) {
    const settings = pricingLimits(rules);
    const tariff = tariffFor(vehicle, rules);
    const minHours = tariff ? tariff.minHours : (vehicle?.pricing?.minHours || 1);
    const hours = numeric(data.hours);
    const distance = data.zone === 'outside' ? numeric(data.distance) : 0;
    const errors = {};
    if (!Number.isFinite(hours) || hours < minHours) errors.hours = `Укажите не менее ${formatNumber(minHours)} ч.`;
    else if (hours > settings.maxHours) errors.hours = `Для расчёта доступно не более ${formatNumber(settings.maxHours)} ч.`;
    else if (!onStep(hours, settings.hourStep)) errors.hours = `Укажите длительность с шагом ${formatNumber(settings.hourStep)} ч.`;
    if (!['city', 'outside'].includes(data.zone)) errors.zone = 'Выберите перевозку по городу или за городом.';
    if (data.zone === 'outside' && (!Number.isInteger(distance) || distance < 1 || distance > settings.maxDistance)) errors.distance = `Укажите расстояние от 1 до ${settings.maxDistance} км целым числом.`;
    return { settings, tariff, hours, distance, errors };
  }
  function quotePrice(values, vehicle, rules = {}) {
    if (!vehicle) return { state: 'choose' };
    const data = normalize(values);
    const input = pricingInput(data, vehicle, rules);
    if (Object.keys(input.errors).length) return { state: 'incomplete', errors: input.errors };
    if (!input.tariff) return { state: 'quote' };
    const billedKm = input.distance * (input.settings.roundTrip ? 2 : 1);
    const workCents = Math.round(input.hours * input.tariff.hourly * 100);
    const mileageCents = Math.round(billedKm * input.tariff.perKm * 100);
    if (![workCents, mileageCents, workCents + mileageCents].every(Number.isSafeInteger)) return { state: 'quote' };
    return { state: 'ready', hours: input.hours, distance: input.distance, billedKm, roundTrip: input.settings.roundTrip, hourly: input.tariff.hourly, perKm: input.tariff.perKm, work: workCents / 100, mileage: mileageCents / 100, total: (workCents + mileageCents) / 100 };
  }
  function formatNumber(value) { return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value); }
  function formatMoney(value) { return `${formatNumber(value)} ₽`; }
  function formatDate(value) {
    if (!isRealDate(value)) return value;
    const [year, month, day] = value.split('-');
    return `${day}.${month}.${year}`;
  }
  function message(data, vehicle, company, rules = {}) {
    if (!vehicle) throw new Error('Транспорт не выбран');
    const quote = quotePrice(data, vehicle, rules);
    const lines = [
      'Здравствуйте. Хочу обсудить заявку на услугу.',
      `Компания: ${company.name}`,
      '',
      `Услуга: ${vehicle.name}`,
      `Вариант услуги: ${vehicle.service}`,
      `${vehicle.onSite ? "Адрес работ" : "Откуда"}: ${data.from}`,
      ...(vehicle.onSite ? [] : [`Куда: ${data.to}`]),
      `Желаемая дата: ${formatDate(data.date)}`,
      `Желаемое время: ${data.time || 'По согласованию'}`,
      `Длительность: ${data.hours} ч`,
      ...(vehicle.onSite ? [] : [`Перевозка: ${data.zone === 'outside' ? 'За городом / межгород' : 'По городу'}`]),
      `Описание задачи: ${data.cargo}`,
      `Комментарий: ${data.comment || 'Не указан'}`,
      `Обратная связь: ${data.contact || 'Не указана'}`,
      ''
    ];
    if (quote.state === 'ready') {
      lines.push(`Работа: ${formatNumber(quote.hours)} ч × ${formatMoney(quote.hourly)} = ${formatMoney(quote.work)}`);
      if (data.zone === 'outside') lines.push(`Расстояние в одну сторону: ${formatNumber(quote.distance)} км`, `Пробег${quote.roundTrip ? ' с возвратом' : ''}: ${formatNumber(quote.billedKm)} км × ${formatMoney(quote.perKm)} = ${formatMoney(quote.mileage)}`);
      lines.push(`Предварительная стоимость: ${formatMoney(quote.total)}`);
      if (rules.isExample) lines.push('Расчёт по тарифам для примера. Ставки компании ещё не подтверждены.');
    } else lines.push('Стоимость: по запросу.');
    lines.push('', 'Прошу уточнить стоимость, состав работ и удобное время.');
    return lines.join('\n');
  }
  function telegramLink(value) {
    const username = String(value || '').trim().replace(/^https:\/\/t\.me\//i, '').replace(/^@/, '').replace(/\/$/, '');
    if (/^\+[1-9][0-9]{6,14}$/.test(username)) return `https://t.me/${username}`;
    const reserved = ['addemoji','addlist','addstickers','addstyle','addtheme','auction','auth','boost','call','confirmphone','contact','giftcode','invoice','joinchat','login','m','nft','proxy','setlanguage','share','socks','web','a','k','z'];
    if (!/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username) || reserved.includes(username.toLowerCase())) return '';
    return `https://t.me/${username}`;
  }
  function requestTelegramLink(value, text) { const chat = telegramLink(value); return chat ? `${chat}?text=${encodeURIComponent(text)}` : ''; }
  function vkLink(value) {
    const input = String(value || '').trim();
    return /^https:\/\/(?:vk\.ru|vk\.com)\/[a-zA-Z0-9_.]+\/?$/.test(input) ? input : '';
  }
  function phoneLink(value) {
    const phone = String(value || '').trim();
    if (!/^\+?[\d\s().-]+$/.test(phone)) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return '';
    return `tel:${phone.startsWith('+') ? '+' : ''}${digits}`;
  }
  function imagePath(value) {
    const path = String(value || '').trim();
    if (/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(path) && path.length <= 900000) return path;
    if (/^https:\/\//i.test(path)) {
      try {
        const url = new URL(path);
        return url.hostname && !url.username && !url.password ? url.href : '';
      } catch (_) { return ''; }
    }
    if (!path.startsWith('assets/') || !/\.(?:png|jpe?g|webp|avif|gif|svg)$/i.test(path)) return '';
    const parts = path.split('/');
    if (parts.some(part => !part || part === '.' || part === '..' || /[\\\x00-\x1f]/.test(part))) return '';
    try { return parts.map(part => encodeURIComponent(part)).join('/'); } catch (_) { return ''; }
  }
  async function copyText(value, writeModern, writeFallback) {
    if (typeof writeModern === 'function') {
      try { await writeModern(value); return true; } catch (_) { /* Пробуем резервный способ. */ }
    }
    if (typeof writeFallback === 'function') {
      try { return Boolean(writeFallback(value)); } catch (_) { /* Остаётся ручное выделение. */ }
    }
    return false;
  }
  return { vkLink, pricingLimits, tariffFor, quotePrice, formatNumber, formatMoney, telegramLink, requestTelegramLink, phoneLink, imagePath, copyText, localToday, normalize, validate, isRealDate, formatDate, message, limits };
});
