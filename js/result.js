(() => {
  const HISTORY_KEY = 'testBaseHistory';
  const raw = sessionStorage.getItem('testBaseResult');
  if (!raw) { location.replace('index.html?v=20261118-2225'); return; }
  try {
    const result = JSON.parse(raw);
    document.getElementById('resultTitle').textContent = result.title || 'Результат тестирования';
    document.getElementById('scoreNumber').textContent = Number(result.percent) || 0;
    document.getElementById('correctCount').textContent = Number(result.correct) || 0;
    document.getElementById('totalCount').textContent = Number(result.total) || 0;
    document.getElementById('gradeValue').textContent = result.grade || '—';
    const passed = typeof result.passed === 'boolean' ? result.passed : (Number(result.percent) >= Number(result.passPercent || 60));
    const status = document.getElementById('passStatus');
    if (status) {
      status.textContent = passed ? 'ЗАЧЁТ · проходной балл ' + Number(result.passPercent || 60) + '%' : 'НЕ ЗАЧЁТ · необходимо ' + Number(result.passPercent || 60) + '%';
      status.classList.add(passed ? 'passed' : 'failed');
    }
    const detail = document.getElementById('resultDetail');
    if (detail) detail.textContent = result.autoFinished ? (result.reason || 'Тест завершён автоматически.') : 'Попытка завершена ' + (result.finishedAt ? new Date(result.finishedAt).toLocaleString('ru-RU') : '');
    if (result.autoFinished) document.querySelector('.result-card .muted').textContent = result.reason || 'Тест завершён автоматически.';
    const notes = [];
    if (Number(result.warningCount) > 0) notes.push('Зафиксировано переключений вкладки: ' + result.warningCount + '.');
    if (result.reason) notes.push(result.reason);
    if (notes.length) document.getElementById('integrityNote').textContent = [...new Set(notes)].join(' ');

    const history = readHistory();
    if (!history.some(item => item.id && item.id === result.id)) {
      history.unshift(result);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0,300))); }
      catch (error) { console.warn('Не удалось сохранить историю прохождений:', error); }
    }
    sessionStorage.removeItem('testBaseResult');
  } catch (error) {
    console.error(error);
    location.replace('index.html?v=20261118-2225');
  }

  function readHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) { return []; }
  }
})();