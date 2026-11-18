(() => {
  const raw=sessionStorage.getItem('testBaseResult');
  if(!raw){location.replace('index.html');return;}
  try{
    const result=JSON.parse(raw);
    document.getElementById('resultTitle').textContent=result.title||'Результат тестирования';
    document.getElementById('scoreNumber').textContent=Number(result.percent)||0;
    document.getElementById('correctCount').textContent=Number(result.correct)||0;
    document.getElementById('totalCount').textContent=Number(result.total)||0;
    document.getElementById('gradeValue').textContent=result.grade||'—';
    const passed=typeof result.passed==='boolean'?result.passed:(Number(result.percent)>=Number(result.passPercent||60));
    const passStatus=document.getElementById('passStatus');
    passStatus.textContent=passed?'ЗАЧЁТ · проходной балл '+Number(result.passPercent||60)+'%':'НЕ ЗАЧЁТ · необходимо '+Number(result.passPercent||60)+'%';
    passStatus.classList.add(passed?'passed':'failed');
    if(result.timeUp)document.querySelector('.result-card .muted').textContent=result.reason||'Тест завершён автоматически.';
    const notes=[];
    if(Number(result.warningCount)>0)notes.push('Зафиксировано переключений вкладки: '+result.warningCount+'.');
    if(result.reason)notes.push(result.reason);
    if(notes.length)document.getElementById('integrityNote').textContent=notes.join(' ');
  }catch(error){console.error(error);location.replace('index.html');}
})();