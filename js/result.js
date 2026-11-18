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
    if(result.timeUp)document.querySelector('.result-card .muted').textContent=result.reason||'Время тестирования истекло. Результат зафиксирован.';
    if(Number(result.warningCount)>0)document.getElementById('integrityNote').textContent='Зафиксировано переключений вкладки: '+result.warningCount+'.';
  }catch(error){console.error(error);location.replace('index.html');}
})();