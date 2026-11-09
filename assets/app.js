(function () {
  'use strict';
  const config = window.SITE_CONFIG;
  const captureMode = new URLSearchParams(location.search).get('capture') === '1';
  if (captureMode) document.documentElement.classList.add('capture-mode');
  const core = window.RequestCore;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  const form = $('#request-form');
  const dialog = $('#request-dialog');
  if (!config || !config.company || !Array.isArray(config.vehicles) || !core) {
    $('#form-status').textContent = 'Не удалось загрузить данные сайта. Обновите страницу.';
    return;
  }
  if (window.DRAFT_PREVIEW) { $('#draft-banner').hidden = false; $('#draft-label').textContent = window.DRAFT_PREVIEW; }
  $('#fleet-count').textContent = config.vehicles.length;
  const serviceCount = config.vehicles.length;
  const serviceWord = serviceCount % 10 === 1 && serviceCount % 100 !== 11 ? 'направление услуг' : serviceCount % 10 >= 2 && serviceCount % 10 <= 4 && (serviceCount % 100 < 12 || serviceCount % 100 > 14) ? 'направления услуг' : 'направлений услуг';
  $('.hero-facts > div:first-child > span').textContent = serviceWord;
  const fields = ['vehicle', 'hours', 'zone', 'distance', 'from', 'to', 'date', 'cargo', 'comment', 'contact', 'time'];
  const pricingRules = config.pricing || {};
  const pricingLimits = core.pricingLimits(pricingRules);
  let copying = false;
  let revision = 0;
  let closeTarget = $('#prepare-request');
  let editOnClose = false;
  let backdropPress = false;
  const logoHost = $('[data-logo]');
  const logoFallback = logoHost.firstElementChild.cloneNode(true);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function text(selector, value) { $$(selector).forEach(el => { el.textContent = value; }); }
  function assetPath(value) {
    return core.imagePath(value);
  }
  function values() { return Object.fromEntries(new FormData(form).entries()); }
  function status(message) { $('#form-status').textContent = message; }
  const sectionIds = ['main', 'fleet', 'request', 'conditions'];
  function navigateTo(id, options = {}) {
    if (!sectionIds.includes(id)) return;
    const target = document.getElementById(id);
    const headerHeight = $('.site-header').getBoundingClientRect().height;
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerHeight);
    window.scrollTo({ top, behavior: (captureMode || window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'instant' : 'smooth' });
    if (options.history !== false && location.hash !== `#${id}`) {
      try { history.pushState(null, '', `#${id}`); } catch (_) { /* Прокрутка работает и без History API. */ }
    }
    for (const link of $$('.header-inner nav a')) {
      const active = link.getAttribute('href') === `#${id}`;
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    }
    if (options.focus !== false) {
      const heading = id === 'main' ? target : target.querySelector('h2') || target.querySelector('summary');
      heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true });
    }
  }
  function updatePricingFields(adjustMinimum = false) {
    const vehicle = config.vehicles.find(v => v.id === $('#vehicle').value);
    const tariff = core.tariffFor(vehicle, pricingRules);
    const min = tariff ? tariff.minHours : (vehicle?.pricing?.minHours || 1);
    $('#hours').min = min; $('#hours').max = pricingLimits.maxHours; $('#hours').step = pricingLimits.hourStep;
    if (adjustMinimum && (!Number.isFinite(Number($('#hours').value)) || Number($('#hours').value) < min)) $('#hours').value = min;
    $('#hours-hint').textContent = tariff ? `Минимум ${core.formatNumber(min)} ч. Шаг ${core.formatNumber(pricingLimits.hourStep)} ч.` : 'Длительность уточняется при подтверждении заявки.';
    const onsite = vehicle?.onSite === true;
    $('#to').disabled = onsite; $('#to').required = !onsite; $('#to').closest('.field').hidden = onsite;
    $('label[for=from]').innerHTML = onsite ? 'Адрес работ <span>*</span>' : 'Откуда <span>*</span>';
    $('#from').placeholder = onsite ? 'Город, улица, дом или название объекта' : 'Город, улица, дом';
    $('#route-heading').textContent = onsite ? 'Адрес работ и дата' : 'Маршрут и дата';
    $('#time-hint').textContent = onsite ? 'Местное время по адресу работ. Время согласуется при заказе.' : 'Местное время по адресу отправления. Время согласуется при заказе.';
    $('#zone').closest('.field').hidden = onsite; if (onsite) $('#zone').value = 'city';
    const outside = $('#zone').value === 'outside';
    $('#distance-field').hidden = !outside; $('#distance').disabled = !outside; $('#distance').required = outside;
    $('#distance').max = pricingLimits.maxDistance;
    $('#distance-hint').textContent = `${tariff ? `Тариф: ${core.formatMoney(tariff.perKm)} / км. ` : ''}${pricingLimits.roundTrip ? 'В расчёт входит обратный путь: расстояние × 2.' : 'В расчёте учитывается только расстояние в одну сторону.'} Пробег по адресам автоматически не определяется.`;
    if (!outside) { $('#distance-error').textContent = ''; $('#distance').removeAttribute('aria-invalid'); }
  }
  function renderPrice(data, vehicle) {
    const quote = core.quotePrice(data, vehicle, pricingRules);
    $('#price-breakdown').hidden = quote.state !== 'ready';
    if (quote.state === 'ready') {
      $('#estimated-price').textContent = core.formatMoney(quote.total);
      $('#work-price').textContent = `${core.formatNumber(quote.hours)} ч × ${core.formatMoney(quote.hourly)} = ${core.formatMoney(quote.work)}`;
      $('#mileage-price-row').hidden = data.zone !== 'outside';
      $('#mileage-price').textContent = `${core.formatNumber(quote.billedKm)} км × ${core.formatMoney(quote.perKm)} = ${core.formatMoney(quote.mileage)}`;
      $('#estimate-hint').textContent = data.zone === 'outside'
        ? `${quote.roundTrip ? 'Пробег включает обратный путь. ' : ''}Стоимость и условия согласуются при заказе.`
        : 'Расчёт по времени работы. Погрузку, ожидание и окончательную стоимость согласуем при заказе.';
    } else {
      $('#estimated-price').textContent = quote.state === 'choose' ? 'Выберите услугу' : quote.state === 'quote' ? 'По запросу' : 'Уточните параметры';
      $('#estimate-hint').textContent = quote.state === 'incomplete' ? Object.values(quote.errors)[0] : quote.state === 'quote' ? 'Стоимость и условия согласуются после уточнения заявки.' : 'Выберите услугу и укажите желаемую длительность.';
    }
    $('#inline-price').textContent = $('#estimated-price').textContent;
    return quote;
  }
  function watchImage(image, kind) {
    const failed = () => {
      image.dataset.imageState = 'error';
      if (kind === 'logo') { logoHost.replaceChildren(logoFallback); return; }
      image.hidden = true;
      if (kind === 'summary') return;
      const host = kind === 'hero' ? $('.hero') : image.parentElement;
      host.classList.add('image-missing');
      if (host.querySelector('.image-fallback')) return;
      const fallback = document.createElement('div');
      fallback.className = `image-fallback${kind === 'hero' ? ' hero-fallback' : ''}`;
      fallback.innerHTML = '<svg viewBox="0 0 64 48" aria-hidden="true"><path d="M4 8h34v27H4zM38 19h13l9 11v5H38M46 19v11h14"/><circle cx="16" cy="37" r="6"/><circle cx="48" cy="37" r="6"/></svg>';
      const caption = document.createElement('span'); caption.textContent = 'Иллюстрация недоступна';
      fallback.append(caption); host.append(fallback);
    };
    image.addEventListener('error', failed);
    image.addEventListener('load', () => {
      image.dataset.imageState = 'loaded';
      image.hidden = kind === 'summary' ? !$('#vehicle').value : false;
      if (kind === 'logo' || kind === 'summary') return;
      const host = kind === 'hero' ? $('.hero') : image.parentElement;
      host.classList.remove('image-missing');
      const fallback = host.querySelector('.image-fallback'); if (fallback) fallback.remove();
    });
    if (image.hasAttribute('src') && image.complete && !image.naturalWidth) failed();
  }
  const palette = { accent:'--accent', accentHover:'--accent-hover', ink:'--ink', background:'--background' };
  for (const [key, css] of Object.entries(palette)) {
    if (/^#[0-9a-f]{6}$/i.test((config.theme || {})[key])) {
      document.documentElement.style.setProperty(css, (config.theme || {})[key]);
      if (key === 'background') document.querySelector('meta[name="theme-color"]').content = (config.theme || {})[key];
    }
  }
  document.title = `${config.company.name} — ${config.company.descriptor}`;
  document.querySelector('meta[name="description"]').content = `Грузоперевозки: ${config.company.region}. Выберите транспорт, укажите маршрут и подготовьте заявку.`;
  text('[data-company-name]', config.company.name);
  text('[data-company-descriptor]', config.company.descriptor);
  text('[data-region]', config.company.region);
  text('[data-hero-title]', config.hero.title);
  text('[data-hero-description]', config.hero.description);
  $$('[data-example]').forEach(el => { el.hidden = pricingRules.isExample !== true; });
  $('.brand').title = config.company.name;
  watchImage($('[data-hero-image]'), 'hero');
  $('[data-hero-image]').src = assetPath(config.hero.image);
  $('[data-hero-image]').alt = config.hero.imageAlt;
  if (config.company.name.length > 22) {
    $$('.brand').forEach(el => el.classList.add('long-brand'));
    $('.header-inner').classList.add('has-long-brand');
  }
  if (config.company.logo && assetPath(config.company.logo)) {
    const image = document.createElement('img');
    image.alt = ''; watchImage(image, 'logo'); image.src = assetPath(config.company.logo);
    $('[data-logo]').replaceChildren(image);
  }
  for (const condition of config.conditions) {
    const li = document.createElement('li'); li.textContent = condition; $('#conditions-list').append(li);
  }
  const telegramUrl = core.telegramLink(config.company.telegram);
  const vkUrl = core.vkLink(config.company.vk);
  if (!telegramUrl && vkUrl) {
    $$('[data-direct-contact]').forEach(link => { link.href=vkUrl; link.textContent='Написать в ВК'; link.target='_blank'; link.rel='noopener noreferrer'; });
    $('#prepare-request').textContent='Подготовить заявку для ВК →';
    $('.summary-footnote').textContent='Скопируйте заявку и отправьте в сообщения сообщества ВК.';
    $('#dialog-title').textContent='Заявка для ВК';
    $('label[for=contact]').innerHTML='Телефон или ВК <small>необязательно</small>';
    $('#contact').placeholder='Телефон или ссылка на профиль ВК';
  }
  if (vkUrl) { const link=document.createElement('a'); link.href=vkUrl; link.textContent='ВКонтакте'; link.target='_blank'; link.rel='noopener noreferrer'; $('#company-contacts').append(link); }
  const phone = String(config.company.phone || '').trim();
  const phoneUrl = core.phoneLink(phone);
  if (phoneUrl) {
    const link = document.createElement('a');
    link.href = phoneUrl; link.textContent = phone;
    $('#company-contacts').append(link);
  }
  if (telegramUrl) {
    $$('[data-direct-contact]').forEach(link => { link.href = telegramUrl; link.textContent = 'Написать в Telegram'; link.target = '_blank'; link.rel = 'noopener noreferrer'; });
    const contact = document.createElement('a');
    contact.href = telegramUrl; contact.textContent = 'Telegram'; contact.target = '_blank'; contact.rel = 'noopener noreferrer';
    $('#company-contacts').append(contact);
    const link = $('#telegram-link'); link.href = telegramUrl; link.hidden = false;
    $('#dialog-note').textContent = 'Скопируйте заявку, откройте чат и отправьте сообщение. Отправка выполняется вами.';
  }
  if (config.company.hours) {
    text('[data-company-hours]', config.company.hours); $$('[data-company-hours]').forEach(el => el.hidden = false);
    const hours = document.createElement('span'); hours.className = 'company-hours';
    hours.textContent = config.company.hours; $('#company-contacts').append(hours);
  }
  const grid = $('#vehicle-grid');
  for (const vehicle of config.vehicles) {
    const card = document.createElement('article');
    card.className = 'vehicle-card'; card.dataset.vehicleId = vehicle.id;
    const tariff = core.tariffFor(vehicle, pricingRules);
    const tariffText = vehicle.referencePerPerson && !tariff ? `${core.formatMoney(vehicle.pricing.hourly)} <span class="tariff-unit">/ чел.·ч</span>` : tariff ? `${core.formatMoney(tariff.hourly)} <span class="tariff-unit">/ час</span>` : 'По запросу';
    const minimum = vehicle.referencePerPerson && !tariff ? `По карточке ВК · минимум ${core.formatNumber(vehicle.pricing.minHours)} ч. Итог уточняется.` : tariff ? `мин. заказ ${core.formatNumber(tariff.minHours)} ч` : 'После уточнения заявки';
    card.innerHTML = `<div class="vehicle-media"><img src="${escape(assetPath(vehicle.image))}" alt="${escape(vehicle.imageAlt)}" width="900" height="600" loading="lazy" decoding="async"><span class="selected-badge" aria-hidden="true"><span aria-hidden="true">✓</span> Выбрано</span></div><div class="vehicle-content"><h3>${escape(vehicle.name)}</h3><p class="vehicle-description">${escape(vehicle.description)}</p><div class="vehicle-tariff">${tariffText}<small>${escape(minimum)}</small></div><button class="select-vehicle" type="button" aria-pressed="false" aria-label="Выбрать: ${escape(vehicle.name)}">Выбрать</button></div>`;
    watchImage(card.querySelector('img'), 'card');
    card.querySelector('button').addEventListener('click', () => {
      selectVehicle(vehicle.id);
      navigateTo('request', { focus: false });
      $('#from').focus({ preventScroll: true });
    });
    const availability = Object.hasOwn(OwnerSettings.statuses, vehicle.availability) ? vehicle.availability : 'confirm';
    const badge = document.createElement('span'); badge.className = `availability availability-${availability}`; badge.textContent = OwnerSettings.statuses[availability];
    card.querySelector('h3').after(badge);
    if (availability === 'busy') { card.querySelector('button').disabled = true; card.querySelector('button').textContent = 'Сейчас занята'; }
    grid.append(card);
    const option = document.createElement('option'); option.value = vehicle.id; option.textContent = `${vehicle.name}${tariff ? ' · ' + core.formatMoney(tariff.hourly) + '/ч' : ''}${vehicle.availability === 'busy' ? ' · занята' : ''}`; option.disabled = vehicle.availability === 'busy'; $('#vehicle').append(option);
  }
  function renderSummary() {
    const data = core.normalize(values());
    const vehicle = config.vehicles.find(v => v.id === data.vehicle);
    $('#selected-name').textContent = vehicle ? vehicle.name : 'Выберите услугу';
    $('#summary-to').closest('div').hidden = vehicle?.onSite === true;
    $('#summary-from').previousElementSibling.textContent = vehicle?.onSite ? 'Адрес работ' : 'Откуда';
    $('#summary-cargo').previousElementSibling.textContent = vehicle?.onSite ? 'Задача' : 'Груз';
    $('#selected-detail').textContent = vehicle ? vehicle.service : 'Подходящий вариант есть в каталоге';
    for (const [key, empty] of [['from','Укажите адрес'],['to','Укажите адрес'],['date','Выберите дату'],['cargo','Добавьте описание']]) {
      $(`#summary-${key}`).textContent = data[key] ? (key === 'date' ? core.formatDate(data.date) : data[key]) : empty;
    }
    for (const key of ['comment','contact','time']) {
      $(`#summary-${key}-row`).hidden = !data[key]; $(`#summary-${key}`).textContent = data[key];
    }
    renderPrice(data, vehicle);
    return { data, vehicle };
  }
  function selectVehicle(id) {
    if (config.vehicles.find(v => v.id === id)?.availability === 'busy') return;
    $('#vehicle').value = id;
    for (const card of $$('.vehicle-card')) {
      const selected = card.dataset.vehicleId === id;
      card.classList.toggle('selected', selected);
      card.querySelector('.selected-badge').setAttribute('aria-hidden', String(!selected));
      const button = card.querySelector('button');
      button.setAttribute('aria-pressed', String(selected));
      button.textContent = button.disabled ? 'Недоступно' : selected ? 'Услуга выбрана' : 'Выбрать';
    }
    $('#vehicle-error').textContent = ''; $('#vehicle').removeAttribute('aria-invalid');
    const selectedVehicle = config.vehicles.find(v => v.id === id);
    if (selectedVehicle && ['city', 'outside'].includes(selectedVehicle.defaultZone) && !selectedVehicle.onSite) $('#zone').value = selectedVehicle.defaultZone;
    updatePricingFields(true);
    status(''); revision += 1; renderSummary();
  }
  function validate() {
    $('#date').min = core.localToday();
    const result = core.validate(values(), config.vehicles, core.localToday(), pricingRules);
    for (const key of fields) {
      $(`#${key}-error`).textContent = result.errors[key] || '';
      if (result.errors[key]) $(`#${key}`).setAttribute('aria-invalid', 'true');
      else $(`#${key}`).removeAttribute('aria-invalid');
    }
    return result;
  }
  $('#date').min = core.localToday();
  $('#date').addEventListener('focus', () => { $('#date').min = core.localToday(); });
  $('#vehicle').addEventListener('change', event => selectVehicle(event.target.value));
  for (const key of fields.filter(key => key !== 'vehicle')) {
    const changed = () => {
      if (key === 'zone') updatePricingFields();
      $(`#${key}-error`).textContent = ''; $(`#${key}`).removeAttribute('aria-invalid');
      status(''); revision += 1; renderSummary();
    };
    $(`#${key}`).addEventListener('input', changed);
    $(`#${key}`).addEventListener('change', changed);
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (loadingPhotos) { status('Дождитесь обработки фотографий.'); return; }
    const result = validate();
    if (!result.valid) {
      status('Проверьте отмеченные поля.');
      const field = form.querySelector('[aria-invalid="true"]');
      field.focus({ preventScroll: true });
      const headerHeight = $('.site-header').getBoundingClientRect().height;
      const sectionTop = window.scrollY + $('#request').getBoundingClientRect().top - headerHeight;
      const fieldTop = window.scrollY + field.getBoundingClientRect().top - headerHeight - 32;
      window.scrollTo({ top: Math.max(0, sectionTop, fieldTop), behavior: (captureMode || window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'instant' : 'smooth' }); return;
    }
    const { vehicle } = renderSummary();
    $('#prepared-message').value = core.message(result.data, vehicle, config.company, pricingRules);
    const photoCount = photos.length;
    $('#dialog-photo-note').hidden = !photoCount;
    $('#dialog-photo-note').textContent = `Добавлено фото: ${photoCount}. Прикрепите эти файлы к сообщению компании самостоятельно. Сайт их не передаёт.`;
    if (photoCount) $('#prepared-message').value += `\n\nФотографии груза (${photoCount} шт.) приложу отдельно.`;
    $('#copy-status').textContent = ''; status(''); revision += 1;
    closeTarget = event.submitter || $('#prepare-request'); editOnClose = false;
    const outgoing = $('#prepared-message').value;
    const chat = core.telegramLink(config.company.telegram);
    const vk = core.vkLink(config.company.vk);
    if (event.submitter?.dataset.action !== 'preview' && chat) {
      const href = core.requestTelegramLink(config.company.telegram, outgoing);
      const link = document.createElement('a'); link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer'; document.body.append(link); link.click(); link.remove();
      status('Открываем Telegram с текстом заявки. Подтвердите отправку в чате.'); return;
    }
    $('#telegram-link').href = chat ? core.requestTelegramLink(config.company.telegram, outgoing) : vk || '#';
    $('#telegram-link').textContent = chat ? 'Отправить в Telegram →' : 'Открыть сообщество ВК →';
    $('#telegram-link').hidden = !chat && !vk;
    $('#dialog-note').textContent = chat ? 'Текст будет подставлен в Telegram. Отправку подтвердите в чате.' : vk ? 'Скопируйте текст, откройте сообщество ВК и нажмите кнопку сообщения. Отправка выполняется вами.' : 'В демоверсии получатель ещё не задан. Укажите Telegram компании в панели владельца. Текст заявки можно скопировать.';
    dialog.showModal(); document.body.classList.add('modal-open');
    $('#close-dialog').focus({ preventScroll: true });
  });
  function finishClose() {
    if (!document.body.classList.contains('modal-open')) return;
    document.body.classList.remove('modal-open'); revision += 1;
    const target = editOnClose ? $('#vehicle') : closeTarget;
    target.focus({ preventScroll: true });
    if (editOnClose) navigateTo('request', { focus: false });
    editOnClose = false; backdropPress = false;
  }
  function closeDialog() { dialog.classList.add('is-closing'); setTimeout(() => { dialog.close(); dialog.classList.remove('is-closing'); finishClose(); }, (captureMode || window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 0 : 160); }
  $('#close-dialog').addEventListener('click', closeDialog);
  $('#edit-request').addEventListener('click', () => { editOnClose = true; closeDialog(); });
  dialog.addEventListener('pointerdown', event => {
    const bounds = dialog.getBoundingClientRect();
    backdropPress = event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom);
  });
  dialog.addEventListener('click', event => {
    const startedOutside = backdropPress; backdropPress = false;
    if (!startedOutside || event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog();
  });
  dialog.addEventListener('close', finishClose);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  dialog.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(el => !el.hidden && el.getClientRects().length);
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  $('#copy-message').addEventListener('click', async () => {
    if (copying) return;
    copying = true;
    const button = $('#copy-message'); button.disabled = true;
    const copyRevision = revision;
    const message = $('#prepared-message');
    const modern = window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText === 'function'
      ? value => navigator.clipboard.writeText(value) : null;
    const copied = await core.copyText(message.value, modern, () => {
      if (!dialog.open || revision !== copyRevision) return false;
      message.focus(); message.select(); message.setSelectionRange(0, message.value.length);
      return document.execCommand('copy');
    });
    copying = false; button.disabled = false;
    if (!dialog.open || revision !== copyRevision) return;
    if (copied) $('#copy-status').textContent = 'Текст скопирован. Сообщение ещё не отправлено.';
    else {
      message.focus(); message.select(); message.setSelectionRange(0, message.value.length);
      $('#copy-status').textContent = 'Текст выделен. Нажмите Ctrl+C или выберите «Копировать» на телефоне.';
    }
  });
  const photos = [];
  let loadingPhotos = false;
  function drawPhotos() {
    $('#photo-count').textContent = `${photos.length} из 5`;
    $('#photo-previews').replaceChildren();
    photos.forEach((photo, index) => {
      const li = document.createElement('li');
      const image = document.createElement('img'); image.src = photo.url; image.alt = photo.name;
      const caption = document.createElement('span'); caption.textContent = photo.name;
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Удалить'; remove.setAttribute('aria-label', `Удалить фото: ${photo.name}`);
      remove.addEventListener('click', () => { URL.revokeObjectURL(photo.url); photos.splice(index, 1); drawPhotos(); $('#photos').focus(); });
      li.append(image, caption, remove); $('#photo-previews').append(li);
    });
  }
  $('#photos').addEventListener('change', async event => {
    if (loadingPhotos) return;
    loadingPhotos = true;
    const input = event.target; const incoming = Array.from(input.files); input.disabled = true; $('#prepare-request').disabled = true;
    const errors = [];
    try {
      for (const file of incoming) {
        if (photos.length >= 5) { errors.push('Можно добавить не более 5 фотографий.'); break; }
        if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024 || !file.size) { errors.push(`${file.name}: нужен JPG, PNG или WebP до 8 МБ.`); continue; }
        if (photos.some(p => p.name === file.name && p.size === file.size && p.modified === file.lastModified)) continue;
        const url = URL.createObjectURL(file); const img = new Image(); img.src = url;
        try { await img.decode(); if (img.naturalWidth * img.naturalHeight > 40000000) throw new Error(); }
        catch (_) { URL.revokeObjectURL(url); errors.push(`${file.name}: изображение не удалось открыть или оно больше 40 Мп.`); continue; }
        photos.push({ url, name: file.name, size: file.size, modified: file.lastModified });
      }
      drawPhotos(); $('#photos-status').textContent = errors.join(' ');
    } finally { input.value = ''; input.disabled = false; $('#prepare-request').disabled = false; loadingPhotos = false; }
  });
  const header = $('.site-header');
  const footer = $('.site-footer');
  const updateHeaderOffset = () => {
    const height = Math.ceil(header.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--header-height', `${height}px`);
    document.documentElement.style.setProperty('--header-offset', `${height}px`);
    document.documentElement.style.setProperty('--footer-height', `${Math.ceil(footer.getBoundingClientRect().height)}px`);
  };
  updateHeaderOffset();
  if (window.ResizeObserver) {
    const observer = new ResizeObserver(updateHeaderOffset);
    observer.observe(header); observer.observe(footer);
  } else window.addEventListener('resize', updateHeaderOffset);
  for (const link of $$('a[href^="#"]')) {
    const id = link.getAttribute('href').slice(1);
    if (sectionIds.includes(id)) link.addEventListener('click', event => { event.preventDefault(); navigateTo(id); });
  }
  window.addEventListener('hashchange', () => navigateTo(location.hash.slice(1), { history: false }));
  updatePricingFields();
  renderSummary();
  if (sectionIds.includes(location.hash.slice(1))) navigateTo(location.hash.slice(1), { history: false, focus: false });
  $('#prepare-request').disabled = false;
})();
