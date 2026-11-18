(() => {
  const $ = id => document.getElementById(id);
  const HISTORY_KEY = 'testBaseHistory';
  let tests = [], questions = [], changeCount = 0, ready = false, editingId = null;

  async function init() {
    try {
      const [testsResponse, questionsResponse] = await Promise.all([
        fetch('data/tests.json?v=20261118-2225'),
        fetch('data/questions.json?v=20261118-2225')
      ]);
      if (!testsResponse.ok || !questionsResponse.ok) throw new Error('Не удалось загрузить JSON-файлы. Проверьте GitHub Pages.');
      const testsData = await testsResponse.json(), questionsData = await questionsResponse.json();
      tests = Array.isArray(testsData.tests) ? testsData.tests : [];
      questions = Array.isArray(questionsData.questions) ? questionsData.questions : [];
      normalizeTests();
      fillTests();
      loadSelectedSettings();
      renderQuestions();
      updateStats();
      renderHistory();
      buildChoiceFields();
      ready = true;
      $('downloadQuestions').disabled = false;
      $('downloadTests').disabled = false;
      setStatus('База загружена. Можно создавать и редактировать вопросы.', 'success');
      setSettingsStatus('Настройки загружены.', 'success');
      bindEvents();
    } catch (error) {
      setStatus(error.message, 'error');
      setSettingsStatus(error.message, 'error');
      $('questionList').innerHTML = '<div class="empty-state">' + escapeHtml(error.message) + '</div>';
    }
  }

  function bindEvents() {
    $('questionForm').addEventListener('submit', saveQuestion);
    $('questionSearch').addEventListener('input', renderQuestions);
    $('downloadQuestions').addEventListener('click', downloadQuestions);
    $('downloadTests').addEventListener('click', downloadTests);
    $('settingsTestSelect').addEventListener('change', loadSelectedSettings);
    $('questionCountMode').addEventListener('change', showCountFields);
    $('settingsForm').addEventListener('submit', saveSettings);
    $('examMode').addEventListener('change', () => { if (!$('examMode').checked) $('fullscreenRequired').checked = false; });
    $('questionType').addEventListener('change', buildChoiceFields);
    $('questionImageUrl').addEventListener('input', renderImagePreview);
    $('questionImageFile').addEventListener('change', readQuestionImage);
    $('cancelEdit').addEventListener('click', resetQuestionForm);
    $('newTestForm').addEventListener('submit', createTest);
    $('deleteTest').addEventListener('click', deleteSelectedTest);
    $('exportHistory').addEventListener('click', exportHistory);
    $('clearHistory').addEventListener('click', clearHistory);
  }

  function normalizeTests() {
    tests.forEach(test => {
      test.questionCountMode ||= 'random';
      test.questionCountMin = Number(test.questionCountMin) || 3;
      test.questionCountMax = Number(test.questionCountMax) || Number(test.questionCount) || 5;
      test.timeMinutes = Number(test.timeMinutes) || 10;
      test.passPercent = Number.isFinite(Number(test.passPercent)) ? Number(test.passPercent) : 60;
      if (typeof test.shuffleQuestions !== 'boolean') test.shuffleQuestions = true;
      if (typeof test.shuffleAnswers !== 'boolean') test.shuffleAnswers = true;
      if (typeof test.examMode !== 'boolean') test.examMode = test.security?.enabled !== false;
      test.security ||= {};
      test.security.enabled = test.examMode;
      test.security.maxWarnings = Number(test.security.maxWarnings) || 2;
      test.security.finishOnLimit = test.security.finishOnLimit !== false;
      if (typeof test.security.fullscreenRequired !== 'boolean') test.security.fullscreenRequired = true;
    });
  }

  function fillTests() {
    const options = tests.map(test => '<option value="' + escapeHtml(test.id) + '">' + escapeHtml(test.title) + '</option>').join('');
    $('testSelect').innerHTML = options || '<option value="">Сначала создайте тест</option>';
    $('settingsTestSelect').innerHTML = options || '<option value="">Нет тестов</option>';
  }

  function selectedTest() { return tests.find(test => test.id === $('settingsTestSelect').value); }

  function loadSelectedSettings() {
    const test = selectedTest();
    if (!test) { $('settingsForm').querySelectorAll('input,select,button').forEach(el => { if (el.id !== 'downloadTests') el.disabled = true; }); return; }
    $('settingsForm').querySelectorAll('input,select,button').forEach(el => el.disabled = false);
    $('questionCountMode').value = test.questionCountMode || 'random';
    $('questionCount').value = test.questionCount || 5;
    $('questionCountMin').value = test.questionCountMin || 3;
    $('questionCountMax').value = test.questionCountMax || test.questionCount || 5;
    $('timeMinutes').value = test.timeMinutes || 10;
    $('passPercent').value = test.passPercent ?? 60;
    $('maxWarnings').value = test.security?.maxWarnings || 2;
    $('shuffleQuestions').checked = test.shuffleQuestions !== false;
    $('shuffleAnswers').checked = test.shuffleAnswers !== false;
    $('examMode').checked = test.examMode !== false;
    $('fullscreenRequired').checked = test.security?.fullscreenRequired !== false;
    showCountFields();
  }

  function showCountFields() {
    const mode = $('questionCountMode').value;
    $('fixedCountGroup').hidden = mode !== 'fixed';
    $('randomMinGroup').hidden = mode !== 'random';
    $('randomMaxGroup').hidden = mode !== 'random';
  }

  function saveSettings(event) {
    event.preventDefault();
    if (!ready) return;
    const test = selectedTest();
    if (!test) return;
    const mode = $('questionCountMode').value;
    const time = Number($('timeMinutes').value), pass = Number($('passPercent').value), warnings = Number($('maxWarnings').value);
    const fixed = Number($('questionCount').value), min = Number($('questionCountMin').value), max = Number($('questionCountMax').value);
    if (!Number.isInteger(time) || time < 1 || time > 600) return setSettingsStatus('Время должно быть от 1 до 600 минут.', 'error');
    if (!Number.isInteger(pass) || pass < 1 || pass > 100) return setSettingsStatus('Проходной процент должен быть от 1 до 100.', 'error');
    if (!Number.isInteger(warnings) || warnings < 1 || warnings > 20) return setSettingsStatus('Количество нарушений должно быть от 1 до 20.', 'error');
    if (mode === 'fixed' && (!Number.isInteger(fixed) || fixed < 1 || fixed > 1000)) return setSettingsStatus('Укажите фиксированное количество от 1 до 1000.', 'error');
    if (mode === 'random' && (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > 1000)) return setSettingsStatus('Проверьте диапазон случайного количества вопросов.', 'error');
    test.questionCountMode = mode;
    test.questionCount = mode === 'fixed' ? fixed : (test.questionCount || 5);
    test.questionCountMin = mode === 'random' ? min : (test.questionCountMin || 3);
    test.questionCountMax = mode === 'random' ? max : (test.questionCountMax || 5);
    test.timeMinutes = time;
    test.passPercent = pass;
    test.shuffleQuestions = $('shuffleQuestions').checked;
    test.shuffleAnswers = $('shuffleAnswers').checked;
    test.examMode = $('examMode').checked;
    test.security = { ...(test.security || {}), enabled: test.examMode, maxWarnings: warnings, finishOnLimit: true, fullscreenRequired: test.examMode && $('fullscreenRequired').checked };
    changed();
    setSettingsStatus('Настройки сохранены в редакторе. Скачайте tests.json для публикации.', 'success');
  }

  function createTest(event) {
    event.preventDefault();
    const title = $('newTestTitle').value.trim();
    const category = $('newTestCategory').value.trim() || 'Без категории';
    const time = Number($('newTestTime').value);
    if (!title) return setTestCreateStatus('Укажите название теста.', 'error');
    if (!Number.isInteger(time) || time < 1 || time > 600) return setTestCreateStatus('Время должно быть от 1 до 600 минут.', 'error');
    const id = uniqueTestId(title);
    const test = {
      id, code: 'TEST-' + String(tests.length + 1).padStart(3, '0'), title, category,
      description: $('newTestDescription').value.trim(), timeMinutes: time,
      questionCountMode: 'all', questionCount: 5, questionCountMin: 3, questionCountMax: 5,
      passPercent: 60, shuffleQuestions: true, shuffleAnswers: true, examMode: true,
      security: { enabled: true, maxWarnings: 2, finishOnLimit: true, fullscreenRequired: true }
    };
    tests.push(test);
    fillTests();
    $('settingsTestSelect').value = id;
    $('testSelect').value = id;
    loadSelectedSettings();
    $('newTestForm').reset();
    changed();
    setTestCreateStatus('Тест создан в редакторе. Скачайте tests.json для публикации.', 'success');
  }

  function deleteSelectedTest() {
    const test = selectedTest();
    if (!test) return;
    const attached = questions.filter(question => question.testId === test.id).length;
    if (!confirm('Удалить тест «' + test.title + '» и все его вопросы (' + attached + ')?')) return;
    tests = tests.filter(item => item.id !== test.id);
    questions = questions.filter(question => question.testId !== test.id);
    fillTests();
    if (tests.length) {
      loadSelectedSettings();
      if (!$('testSelect').value) $('testSelect').selectedIndex = 0;
    }
    renderQuestions();
    changed();
    setSettingsStatus('Тест и его вопросы удалены из редактора. Скачайте оба JSON-файла.', 'success');
  }

  function buildChoiceFields(values = []) {
    const type = $('questionType').value;
    const isChoice = type === 'single' || type === 'multiple';
    $('choiceFields').hidden = !isChoice;
    $('textAnswerGroup').hidden = type !== 'text';
    $('singleCorrectGroup').hidden = type !== 'single';
    $('multipleCorrectGroup').hidden = type !== 'multiple';
    if (!isChoice) return;
    const existing = values.length ? values : Array.from({length:4}, (_, index) => $('choice' + index)?.value || '');
    $('choiceEditor').innerHTML = existing.map((value,index) => '<label class="answer-editor-row"><span>' + String.fromCharCode(65+index) + '</span><input id="choice' + index + '" class="field-control" maxlength="500" placeholder="Вариант ' + String.fromCharCode(65+index) + '" value="' + escapeAttribute(value) + '" required></label>').join('');
    $('multipleCorrect').innerHTML = existing.map((_,index) => '<label class="correct-check"><input type="checkbox" value="' + index + '"><span>' + String.fromCharCode(65+index) + '</span></label>').join('');
  }

  function readQuestionImage() {
    const file = $('questionImageFile').files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) return setStatus('Выберите файл изображения.', 'error');
    if (file.size > 1024 * 1024) return setStatus('Изображение больше 1 МБ. Уменьшите его перед загрузкой.', 'error');
    const reader = new FileReader();
    reader.onload = () => { $('questionImageUrl').value = String(reader.result); renderImagePreview(); setStatus('Изображение добавлено в вопрос. Оно будет встроено в JSON.', 'success'); };
    reader.onerror = () => setStatus('Не удалось прочитать изображение.', 'error');
    reader.readAsDataURL(file);
  }

  function safeImageSource(source) {
    const value = String(source || '').trim();
    if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(value)) return value;
    if (/^(https?:\/\/|\.\.?\/|images\/|assets\/)/i.test(value)) return value;
    return '';
  }

  function renderImagePreview() {
    const src = safeImageSource($('questionImageUrl').value);
    $('imagePreview').hidden = !src;
    $('imagePreview').innerHTML = src ? '<img src="' + escapeAttribute(src) + '" alt="Предпросмотр изображения вопроса"><button type="button" id="removeQuestionImage" class="button button-light">Убрать изображение</button>' : '';
    $('removeQuestionImage')?.addEventListener('click', () => { $('questionImageUrl').value=''; $('questionImageFile').value=''; renderImagePreview(); });
  }

  function saveQuestion(event) {
    event.preventDefault();
    if (!ready) return;
    const testId = $('testSelect').value;
    const questionText = $('questionInput').value.trim();
    const type = $('questionType').value;
    if (!tests.some(test => test.id === testId)) return setStatus('Сначала выберите или создайте тест.', 'error');
    if (!questionText) return setStatus('Введите формулировку вопроса.', 'error');
    const question = {
      id: editingId || createId(), testId, type, question: questionText,
      explanation: $('questionExplanation').value.trim()
    };
    const image = safeImageSource($('questionImageUrl').value);
    if ($('questionImageUrl').value.trim() && !image) return setStatus('Изображение должно быть ссылкой http(s), путём images/... или загруженным файлом.', 'error');
    if (image) question.image = image;

    if (type === 'single' || type === 'multiple') {
      const choices = [0,1,2,3].map(index => $('choice' + index)?.value.trim() || '');
      if (choices.some(choice => !choice)) return setStatus('Заполните все четыре варианта ответа.', 'error');
      question.answers = choices;
      if (type === 'single') {
        question.correct = Number($('correctSingle').value);
      } else {
        const selected = Array.from($('multipleCorrect').querySelectorAll('input:checked')).map(input => Number(input.value));
        if (!selected.length) return setStatus('Отметьте хотя бы один правильный вариант.', 'error');
        question.correctAnswers = selected;
      }
    } else {
      const accepted = $('acceptedAnswers').value.split('\n').map(value => value.trim()).filter(Boolean);
      if (!accepted.length) return setStatus('Укажите хотя бы один допустимый ответ.', 'error');
      question.acceptedAnswers = [...new Set(accepted)];
      question.caseSensitive = false;
    }

    if (editingId) {
      const index = questions.findIndex(item => item.id === editingId);
      if (index >= 0) questions[index] = question;
      setStatus('Вопрос обновлён. Скачайте questions.json для публикации.', 'success');
    } else {
      questions.push(question);
      setStatus('Вопрос добавлен. Скачайте questions.json для публикации.', 'success');
    }
    resetQuestionForm(false);
    changed();
    renderQuestions();
  }

  function editQuestion(id) {
    const question = questions.find(item => item.id === id);
    if (!question) return;
    editingId = id;
    $('questionFormTitle').textContent = 'Редактировать вопрос';
    $('saveQuestion').textContent = 'Сохранить изменения';
    $('cancelEdit').hidden = false;
    $('testSelect').value = question.testId;
    $('questionType').value = question.type || 'single';
    $('questionInput').value = question.question || '';
    $('questionImageUrl').value = question.image || '';
    $('questionExplanation').value = question.explanation || '';
    const answers = Array.isArray(question.answers) ? question.answers.map(answer => typeof answer === 'string' ? answer : answer.text || '') : [];
    if (question.type === 'text') {
      $('acceptedAnswers').value = (question.acceptedAnswers || []).join('\n');
      buildChoiceFields();
    } else {
      buildChoiceFields(answers.length ? answers : ['', '', '', '']);
      if (question.type === 'multiple') {
        const correct = question.correctAnswers || [];
        $('multipleCorrect').querySelectorAll('input').forEach(input => { input.checked = correct.includes(Number(input.value)); });
      } else $('correctSingle').value = question.correct ?? 0;
    }
    renderImagePreview();
    $('questionForm').scrollIntoView({behavior:'smooth',block:'start'});
    setStatus('Режим редактирования: внесите изменения и сохраните вопрос.', 'success');
  }

  function resetQuestionForm(clearStatus = true) {
    editingId = null;
    $('questionForm').reset();
    $('questionFormTitle').textContent = 'Добавить вопрос';
    $('saveQuestion').textContent = '＋ Добавить вопрос';
    $('cancelEdit').hidden = true;
    $('questionType').value = 'single';
    $('acceptedAnswers').value = '';
    $('questionImageUrl').value = '';
    $('imagePreview').hidden = true;
    $('imagePreview').innerHTML = '';
    buildChoiceFields(['','','','']);
    if (tests.length && !$('testSelect').value) $('testSelect').selectedIndex = 0;
    if (clearStatus) setStatus('Форма очищена.', 'success');
  }

  function removeQuestion(id) {
    const question = questions.find(item => item.id === id);
    if (!question || !confirm('Удалить этот вопрос из подготовленной базы?')) return;
    questions = questions.filter(item => item.id !== id);
    if (editingId === id) resetQuestionForm();
    changed();
    renderQuestions();
    setStatus('Вопрос удалён. Скачайте questions.json для публикации.', 'success');
  }

  function renderQuestions() {
    const query = $('questionSearch').value.trim().toLowerCase();
    const filtered = questions.filter(question => {
      const test = tests.find(item => item.id === question.testId);
      return ((question.question || '') + ' ' + (test?.title || '')).toLowerCase().includes(query);
    });
    if (!filtered.length) {
      $('questionList').innerHTML = '<div class="empty-state">Вопросы не найдены.</div>';
      return;
    }
    $('questionList').innerHTML = filtered.map(question => {
      const test = tests.find(item => item.id === question.testId);
      const type = question.type || 'single';
      const typeName = type === 'multiple' ? 'Несколько ответов' : type === 'text' ? 'Свободный ответ' : 'Один ответ';
      const correctText = type === 'text'
        ? (question.acceptedAnswers || []).join(', ')
        : type === 'multiple'
          ? (question.correctAnswers || []).map(i => optionText(question, i)).join(', ')
          : optionText(question, question.correct ?? 0);
      const image = safeImageSource(question.image);
      return '<article class="bank-question"><div class="bank-question-top"><span class="category-pill">' + escapeHtml(test?.title || question.testId) + '</span><span class="question-type-badge">' + typeName + '</span></div><h3>' + escapeHtml(question.question) + '</h3>' +
        (image ? '<img class="bank-image-thumb" src="' + escapeAttribute(image) + '" alt="Изображение к вопросу">' : '') +
        '<p class="correct-answer">Тип: ' + typeName + ' · Правильный ответ: ' + escapeHtml(correctText || 'не указан') + '</p>' +
        '<div class="bank-question-actions"><button type="button" class="button button-light" data-edit="' + escapeAttribute(question.id) + '">Редактировать</button><button type="button" class="delete-question" data-delete="' + escapeAttribute(question.id) + '">Удалить</button></div></article>';
    }).join('');
    $('questionList').querySelectorAll('[data-delete]').forEach(button => button.addEventListener('click', () => removeQuestion(button.dataset.delete)));
    $('questionList').querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => editQuestion(button.dataset.edit)));
  }

  function optionText(question, index) {
    const value = question.answers?.[index];
    return typeof value === 'string' ? value : value?.text || '';
  }

  function updateStats() {
    $('adminTestCount').textContent = tests.length;
    $('adminQuestionCount').textContent = questions.length;
    $('adminChangesCount').textContent = changeCount;
  }

  function changed() { changeCount++; updateStats(); }

  function readHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) { return []; }
  }

  function renderHistory() {
    const history = readHistory().sort((a,b) => new Date(b.finishedAt) - new Date(a.finishedAt));
    const count = history.length;
    const average = count ? Math.round(history.reduce((sum,item) => sum + Number(item.percent || 0), 0) / count) : null;
    const passRate = count ? Math.round(history.filter(item => item.passed).length / count * 100) : null;
    $('historyCount').textContent = count;
    $('historyAverage').textContent = average === null ? '—' : average + '%';
    $('historyPassRate').textContent = passRate === null ? '—' : passRate + '%';
    if (!count) { $('historyTable').innerHTML = '<div class="empty-state">Пока нет сохранённых результатов. Пройдите тест в этом браузере.</div>'; return; }
    $('historyTable').innerHTML = '<div class="history-row history-head"><span>Тест</span><span>Дата</span><span>Результат</span><span>Статус</span></div>' + history.slice(0,30).map(item => {
      const date = item.finishedAt ? new Date(item.finishedAt).toLocaleString('ru-RU') : '—';
      return '<div class="history-row"><span>' + escapeHtml(item.title || 'Тест') + '</span><span>' + escapeHtml(date) + '</span><span>' + Number(item.percent || 0) + '% (' + Number(item.correct || 0) + '/' + Number(item.total || 0) + ')</span><span class="' + (item.passed ? 'history-passed' : 'history-failed') + '">' + (item.passed ? 'Зачёт' : 'Не зачёт') + '</span></div>';
    }).join('');
  }

  function exportHistory() {
    const history = readHistory();
    if (!history.length) return alert('История прохождений пока пуста.');
    const rows = [['Тест','Дата','Правильных ответов','Всего вопросов','Процент','Статус','Автозавершение','Нарушения']];
    history.forEach(item => rows.push([item.title,item.finishedAt, item.correct,item.total,item.percent,item.passed?'Зачёт':'Не зачёт',item.autoFinished?'Да':'Нет',item.warningCount]));
    const csv = '\uFEFF' + rows.map(row => row.map(value => '"' + String(value ?? '').replace(/"/g,'""') + '"').join(';')).join('\r\n');
    downloadBlob('exam-control-history.csv', csv, 'text/csv;charset=utf-8');
  }

  function clearHistory() {
    if (!readHistory().length) return;
    if (!confirm('Очистить локальную историю прохождений в этом браузере?')) return;
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  }

  function downloadBlob(name, content, type) {
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadQuestions() { if (ready) { downloadBlob('questions.json', JSON.stringify({questions}, null, 2) + '\n', 'application/json;charset=utf-8'); setStatus('Файл questions.json скачан. Загрузите его в data в GitHub.', 'success'); } }
  function downloadTests() { if (ready) { downloadBlob('tests.json', JSON.stringify({tests}, null, 2) + '\n', 'application/json;charset=utf-8'); setSettingsStatus('Файл tests.json скачан. Загрузите его в data в GitHub.', 'success'); } }

  function uniqueTestId(title) {
    const slug = title.toLowerCase().replace(/[^a-zа-яё0-9]+/gi,'-').replace(/^-|-$/g,'').replace(/[а-яё]/g, char => ({а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'}[char] || ''));
    const base = slug || 'test';
    let id = base, suffix = 2;
    while (tests.some(test => test.id === id)) id = base + '-' + suffix++;
    return id;
  }

  function createId() {
    let id;
    do { id = 'q_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }
    while (questions.some(question => question.id === id));
    return id;
  }
  function setStatus(message,type) { $('editorStatus').textContent=message; $('editorStatus').className='editor-status '+(type||''); }
  function setSettingsStatus(message,type) { $('settingsStatus').textContent=message; $('settingsStatus').className='editor-status '+(type||''); }
  function setTestCreateStatus(message,type) { $('testCreateStatus').textContent=message; $('testCreateStatus').className='editor-status '+(type||''); }
  function escapeHtml(value) { return String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character])); }
  function escapeAttribute(value) { return escapeHtml(value); }

  init();
})();