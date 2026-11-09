(async function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const access = await window.ownerReady;
  const base = JSON.parse(JSON.stringify(access.config || SITE_CONFIG));
  const S = OwnerSettings;
  const form = $('#settings-form');
  const notice = message => { $('#settings-status').textContent = message; };
  const companyFields = [ ['name','Название компании',80], ['region','Город и область',160], ['phone','Телефон',80], ['telegram','Telegram для заявок (@username или ссылка по номеру)',120], ['vk','Сообщество ВК для заявок',160], ['hours','График работы',100], ['descriptor','Подпись под названием',100] ];
  function field(id, title, type, value, options = {}) {
    const wrapper = document.createElement('div'); wrapper.className = 'field';
    const label = document.createElement('label'); label.htmlFor = id; label.textContent = title;
    const input = document.createElement('input'); input.id = id; input.name = id; input.type = type; input.value = value ?? '';
    for (const [key, val] of Object.entries(options)) input.setAttribute(key, val);
    wrapper.append(label, input); return wrapper;
  }
  for (const [key,label,max] of companyFields) {
    $('#company-fields').append(field(`company-${key}`, label, 'text', base.company[key], { maxlength: max, ...(key === 'name' || key === 'region' ? { required: '' } : {}) }));
  }
  function textarea(id, title, value) { const row = field(id, title, 'text', value, { maxlength: 2000 }); const area = document.createElement('textarea'); area.id = id; area.value = value || ''; area.maxLength = 2000; area.rows = 3; row.replaceChild(area, row.querySelector('input')); return row; }
  let processing = 0;
  function photoEditor(host, id, title, initial, preview) {
    const wrap = document.createElement('div'); wrap.className = 'owner-photo-editor';
    const image = preview || document.createElement('img'); image.src = RequestCore.imagePath(initial); image.alt = title; if (!preview) wrap.append(image);
    const row = field(id, 'Ссылка или путь к изображению', 'text', initial); row.querySelector('input').maxLength = 900000;
    const input = row.querySelector('input'); input.addEventListener('change', () => { const path = RequestCore.imagePath(input.value); if (path) image.src = path; });
    const label = document.createElement('label'); label.className = 'button button-outline owner-upload'; label.textContent = title;
    const file = document.createElement('input'); file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp'; label.append(file);
    file.addEventListener('change', async () => {
      const selected = file.files[0]; if (!selected) return;
      processing++; file.disabled = true;
      try {
        if (!['image/jpeg','image/png','image/webp'].includes(selected.type) || selected.size > 8*1024*1024) throw new Error('Выберите JPG, PNG или WebP до 8 МБ.');
        const url = URL.createObjectURL(selected); const photo = new Image();
        try {
          photo.src = url; await photo.decode();
          if (photo.naturalWidth * photo.naturalHeight > 40000000) throw new Error('Изображение слишком большое. Максимум 40 Мп.');
          const scale = Math.min(1, 1280/photo.naturalWidth, 900/photo.naturalHeight);
          const canvas = document.createElement('canvas'); canvas.width = Math.round(photo.naturalWidth*scale); canvas.height = Math.round(photo.naturalHeight*scale);
          canvas.getContext('2d').drawImage(photo,0,0,canvas.width,canvas.height);
          const data = canvas.toDataURL('image/webp',.78);
          if (data.length > 900000) throw new Error('После сжатия фотография слишком большая. Выберите другое изображение.');
          input.value = data; image.src = data; notice('Фото заменено. Сохраните изменения.');
        } finally { URL.revokeObjectURL(url); }
      } catch(error) { notice(error.message || 'Не удалось прочитать изображение.'); }
      finally { processing--; file.value = ''; file.disabled = false; }
    });
    const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = 'Указать ссылку вручную'; details.append(summary,row); wrap.append(label,details); host.append(wrap);
  }
  photoEditor($('#company-fields'), 'company-logo', 'Заменить логотип', base.company.logo);
  const siteFields = $('#site-fields');
  siteFields.append(textarea('hero-title','Заголовок',base.hero.title),textarea('hero-description','Описание',base.hero.description),textarea('site-conditions','Условия: каждое с новой строки',base.conditions.join('\n')));
  photoEditor(siteFields, 'hero-image', 'Заменить главное фото', base.hero.image);
  for (const v of base.vehicles) {
    const card = document.createElement('section'); card.className = 'owner-card'; card.setAttribute('aria-labelledby', `title-${v.id}`);
    const head = document.createElement('div'); head.className = 'owner-card-head';
    const img = document.createElement('img'); img.src = RequestCore.imagePath(v.image); img.alt = v.imageAlt; img.width = 120; img.height = 90;
    const text = document.createElement('div'); const name = document.createElement('h3'); name.id = `title-${v.id}`; name.textContent = v.name; const description = document.createElement('p'); description.textContent = v.service; text.append(name, description); head.append(img, text);
    const fields = document.createElement('div'); fields.className = 'owner-price-fields';
    fields.append(field(`${v.id}-hourly`, v.referencePerPerson ? 'Цена за человека в час' : 'Цена за час', 'number', v.pricing.hourly, { min: '0.01', max: '1000000', step: '0.01', required: '' }), field(`${v.id}-minHours`, 'Минимальный заказ, ч', 'number', v.pricing.minHours, { min: base.pricing.hourStep, max: base.pricing.maxHours, step: base.pricing.hourStep, required: '' }), field(`${v.id}-perKm`, 'Цена за км вне города', 'number', v.pricing.perKm, { min: '0', max: '100000', step: '0.01', required: '' }));
    const group = document.createElement('fieldset'); group.className = 'availability-options'; const legend = document.createElement('legend'); legend.textContent = 'Доступность услуги'; group.append(legend);
    for (const [key,label] of Object.entries(S.statuses)) {
      const option = document.createElement('label'); option.className = `status-choice choice-${key}`;
      const radio = document.createElement('input'); radio.type = 'radio'; radio.name = `${v.id}-availability`; radio.value = key; radio.checked = key === (v.availability || 'confirm');
      const span = document.createElement('span'); span.textContent = label; option.append(radio, span); group.append(option);
    }
    const specs = document.createElement('p'); specs.className = 'owner-specs'; specs.textContent = `${v.capacity} · ${v.volume} · ${v.length}`;
    const more = document.createElement('details'); more.className = 'vehicle-edit-details'; const summary = document.createElement('summary'); summary.textContent = 'Фотография и описание'; more.append(summary);
    photoEditor(more, `${v.id}-image`, 'Заменить фотографию', v.image, img);
    const textFields = [['name','Название'],['description','Краткое описание'],['service','Состав услуги'],['capacity','Параметр услуги'],['volume','Объём'],['length','Размеры кузова'],['imageAlt','Описание фотографии']];
    for (const [key,label] of textFields) more.append(key === 'description' ? textarea(`${v.id}-${key}`,label,v[key]) : field(`${v.id}-${key}`,label,'text',v[key], {maxlength:2000,...(key==='name'?{required:''}:{})}));
    const mode = field(`${v.id}-quoteOnly`, 'Стоимость по запросу (до согласования тарифа)', 'checkbox', '');
    mode.querySelector('input').checked = v.quoteOnly === true;
    card.append(head, mode, fields, group, more, specs); $('#owner-grid').append(card);
  }
  function fill(config) {
    for (const [key] of companyFields) $(`#company-${key}`).value = config.company[key] || '';
    $('#company-logo').value = config.company.logo || '';
    $('#hero-image').value = config.hero.image || '';
    $('#hero-title').value = config.hero.title; $('#hero-description').value = config.hero.description; $('#site-conditions').value = config.conditions.join('\n');
    $('#is-example').checked = config.pricing.isExample === true;
    for (const v of config.vehicles) {
      $(`#${v.id}-quoteOnly`).checked = v.quoteOnly === true;
      for (const key of ['name','description','service','capacity','volume','length','imageAlt','image']) $(`#${v.id}-${key}`).value = v[key] || '';
      $(`#title-${v.id}`).textContent = v.name;
      $(`#title-${v.id}`).closest('.owner-card-head').querySelector('img').src = RequestCore.imagePath(v.image);
      for (const key of ['hourly','minHours','perKm']) $(`#${v.id}-${key}`).value = v.pricing[key];
      form.querySelector(`input[name="${v.id}-availability"][value="${v.availability || 'confirm'}"]`).checked = true;
    }
  }
  function collect() {
    if (processing) { notice('Дождитесь обработки фотографии.'); return null; }
    if (!form.reportValidity()) return null;
    const raw = S.snapshot(base);
    for (const [key] of companyFields) raw.company[key] = $(`#company-${key}`).value.trim();
    raw.company.logo = $('#company-logo').value;
    raw.hero = {...base.hero, title: $('#hero-title').value, description: $('#hero-description').value, image: $('#hero-image').value};
    raw.conditions = $('#site-conditions').value.split('\n');
    raw.isExample = $('#is-example').checked;
    for (const v of raw.vehicles) {
      v.quoteOnly = $(`#${v.id}-quoteOnly`).checked;
      for (const key of ['name','description','service','capacity','volume','length','imageAlt','image']) v[key] = $(`#${v.id}-${key}`).value.trim();
      for (const key of ['hourly','minHours','perKm']) v.pricing[key] = Number($(`#${v.id}-${key}`).value);
      v.availability = form.querySelector(`input[name="${v.id}-availability"]:checked`).value;
    }
    try { return S.checked(raw, base); } catch (error) { notice(error.message); return null; }
  }
  async function save() {
    const config = collect(); if (!config) return false;
    if (access.server) {
      try {
        const response = await fetch('api/settings', {method:'PUT',headers:{'Content-Type':'application/json','X-CSRF-Token':access.csrf},body:JSON.stringify({settings:S.snapshot(config),revision:access.revision})});
        const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Не удалось сохранить.');
        access.revision=data.revision; Object.assign(base, config); notice('Изменения сохранены на сайте. Их увидят все посетители после обновления страницы.'); return true;
      } catch(error) { notice(error.message); return false; }
    }
    try { localStorage.setItem(S.KEY, JSON.stringify(S.snapshot(config))); notice('Изменения сохранены в этом браузере. Откройте сайт для проверки. Для переноса на хостинг скачайте config.js.'); return true; }
    catch (_) { notice('Браузер не разрешает сохранить черновик. Скачайте config.js, чтобы сохранить изменения в файл.'); return false; }
  }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  fill(base);
  try { const stored = !access.server && localStorage.getItem(S.KEY); if (stored) { fill(S.checked(JSON.parse(stored), base)); notice('Загружен сохранённый черновик этого браузера.'); } } catch (_) { notice('Сохранённый черновик недоступен или несовместим. Загружены данные config.js.'); }
  if (access.server) { form.querySelector('button[type=submit]').textContent = 'Сохранить на сайте'; $('#save-mode-note').textContent = 'Изменения сохраняются на сервере и применяются для всех посетителей.'; $('#reset').textContent = 'Отменить несохранённые изменения'; }
  form.addEventListener('submit', event => { event.preventDefault(); save(); });
  form.addEventListener('input', () => notice('Есть несохранённые изменения.'));
  $('#preview').addEventListener('click', async () => { if (await save()) location.href = access.server ? 'index.html' : 'index.html?preview=1'; });
  $('#export-config').addEventListener('click', () => {
    const config = collect(); if (!config) return;
    download('config.js', S.toScript(config), 'text/javascript;charset=utf-8');
    notice('Файл подготовлен к скачиванию. Замените им assets/config.js. Сам сайт пока не изменён.');
  });
  $('#export-json').addEventListener('click', () => { const config = collect(); if (config) { download('vector-settings.json', JSON.stringify(S.snapshot(config), null, 2), 'application/json'); notice('Резервная копия подготовлена к скачиванию.'); } });
  $('#import-json').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try { if (file.size > 7000000) throw new Error('Файл слишком большой. Выберите копию JSON из этой панели.'); const config = S.checked(JSON.parse(await file.text()), base); fill(config); notice('Настройки загружены в форму. Проверьте их и сохраните черновик.'); }
    catch (error) { notice(`Не удалось импортировать настройки: ${error.message}`); } finally { event.target.value = ''; }
  });
  $('#reset').addEventListener('click', () => {
    if (access.server) { fill(base); notice('Несохранённые изменения отменены.'); return; }
    if (!confirm('Удалить локальный черновик и вернуть данные из config.js?')) return;
    try { localStorage.removeItem(S.KEY); fill(base); notice('Восстановлены данные config.js.'); } catch (_) { notice('Не удалось очистить черновик. Проверьте разрешения браузера.'); }
  });
})();
