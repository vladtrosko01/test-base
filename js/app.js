async function loadCatalog(){
  const grid=document.getElementById('testGrid');
  try{
    const response=await fetch('data/tests.json');
    if(!response.ok)throw new Error('Не удалось загрузить каталог');
    const data=await response.json();window.testCatalog=data.tests||[];
    fillCategories(window.testCatalog);renderCatalog(window.testCatalog);
    document.getElementById('searchInput').addEventListener('input',applyFilters);
    document.getElementById('categoryFilter').addEventListener('change',applyFilters);
  }catch(error){grid.innerHTML='<div class="empty-state">Не удалось загрузить каталог. Проверьте data/tests.json.</div>';console.error(error);}
}
function fillCategories(tests){
 const select=document.getElementById('categoryFilter');
 [...new Set(tests.map(test=>test.category).filter(Boolean))].sort().forEach(category=>{const option=document.createElement('option');option.value=category;option.textContent=category;select.append(option);});
}
function applyFilters(){
 const query=document.getElementById('searchInput').value.trim().toLowerCase(),category=document.getElementById('categoryFilter').value;
 renderCatalog(window.testCatalog.filter(test=>(!category||test.category===category)&&(!query||(test.title+' '+test.description+' '+test.category).toLowerCase().includes(query))));
}
function renderCatalog(tests){
 const grid=document.getElementById('testGrid');document.getElementById('testCount').textContent='Найдено: '+tests.length;
 if(!tests.length){grid.innerHTML='<div class="empty-state">По вашему запросу ничего не найдено.</div>';return;}
 grid.innerHTML=tests.map(test=>{
  const mode=test.questionCountMode||'fixed';
  const countLabel=mode==='all'?'Все вопросы':mode==='random'?'Случайно '+(test.questionCountMin||3)+'–'+(test.questionCountMax||test.questionCount||5):'Вопросов '+(test.questionCount||5);
  return '<article class="test-card"><div class="card-top"><span class="category-pill">'+escapeHTML(test.category||'ОБЩЕЕ')+'</span><span class="card-code">'+escapeHTML(test.code||test.id)+'</span></div><h3>'+escapeHTML(test.title)+'</h3><p>'+escapeHTML(test.description||'Проверка знаний по выбранной теме.')+'</p><div class="card-meta"><span>◷ '+(Number(test.timeMinutes)||15)+' мин.</span><span>▤ '+escapeHTML(countLabel)+'</span></div><a class="button button-primary card-button" href="test.html?v=20261118-2015&id='+encodeURIComponent(test.id)+'">Начать тест</a></article>';
 }).join('');
}
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));}
loadCatalog();