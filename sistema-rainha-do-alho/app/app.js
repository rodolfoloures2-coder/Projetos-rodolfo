import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* ================= CONFIG ================= */
const CFG = window.RAINHA_CONFIG || {};
const configurado = CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes('SEU-PROJETO') && CFG.SUPABASE_ANON_KEY && !CFG.SUPABASE_ANON_KEY.includes('COLE-AQUI');
const sb = configurado ? createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY) : null;

/* ================= ESTADO ================= */
const S = {
  sessao: null, perfil: null,
  produtos: [], insumos: [], receitas: [], lotes: [], pedidos: [], movs: [],
  custoIns: {}, custoProd: {}, cfg: { impostos: 6, comissao: 3, despesas: 10, margem: 20 },
  usuarios: [], carregadoEm: 0, filtroPed: 'ativos', filtroHist: '', buscaEst: '', buscaIns: '',
};

/* ================= UTIL ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 2) => (isFinite(+v) ? +v : 0).toLocaleString('pt-BR', { maximumFractionDigits: d });
const brl = v => (isFinite(+v) ? +v : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const pct = v => isFinite(v) ? (v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%' : '—';
const n = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return isFinite(x) ? x : 0; };
const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const somaDias = (iso, dias) => { const [y, m, d] = iso.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1, d + dias)); return dt.toISOString().slice(0, 10); };
const diasAte = iso => { const [y, m, d] = iso.split('-').map(Number); const [a, b, c] = hojeISO().split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(a, b - 1, c)) / 864e5); };
const fData = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
const fDataHora = ts => new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const byNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
const papel = () => S.perfil?.papel;
const ehAdmin = () => papel() === 'admin';
const pode = acao => ({
  producao: ['admin', 'producao'], estoque: ['admin', 'producao'],
  pedido_editar: ['admin', 'vendas'], pedido_mover: ['admin', 'vendas', 'producao'], pedido_cancelar: ['admin', 'vendas'],
  custos: ['admin'],
}[acao] || []).includes(papel());
const prodById = id => S.produtos.find(p => p.id === id);
const insById = id => S.insumos.find(i => i.id === id);
const NOMES_PAPEL = { admin: 'Administrador', producao: 'Produção', vendas: 'Vendas', pendente: 'Aguardando liberação' };

function toast(msg, erro = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (erro ? ' err' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  while ($('#toasts').children.length > 3) $('#toasts').firstElementChild.remove();
  setTimeout(() => t.remove(), erro ? 9000 : 4500);
}
function carregando(on) { $('#carregando').hidden = !on; }
function erroTxt(e) {
  const m = e?.message || String(e);
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
  if (/User already registered/i.test(m)) return 'Este e-mail já tem conta. Use “Entrar”.';
  if (/Password should be/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (/JWT expired/i.test(m)) return 'Sua sessão expirou. Entre de novo.';
  return m;
}
async function rpc(nome, args) {
  const { data, error } = await sb.rpc(nome, args);
  if (error) throw error;
  return data;
}
function confirmar(texto, okTxt = 'Confirmar') {
  return new Promise(res => {
    const d = $('#confirmar');
    $('#confTexto').textContent = texto; $('#confSim').textContent = okTxt;
    const fim = v => { d.close(); $('#confSim').onclick = $('#confNao').onclick = null; res(v); };
    $('#confSim').onclick = () => fim(true); $('#confNao').onclick = () => fim(false);
    d.onclose = () => res(false);
    d.showModal();
  });
}
function abrirModal(html) { $('#modalConteudo').innerHTML = html; $('#modal').showModal(); $$('[data-fechar]', $('#modal')).forEach(b => b.onclick = () => $('#modal').close()); }
const fecharModal = () => $('#modal').close();
function baixar(nome, conteudo, tipo) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo })); a.download = nome;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
}
const telaAtiva = id => ['telaLogin', 'telaNovaSenha', 'telaPendente', 'telaApp'].forEach(t => $('#' + t).hidden = t !== id);

/* ================= CUSTOS ================= */
const custoIns = id => S.custoIns[id] ?? 0;
function custoProduto(pid) {
  let mat = 0;
  for (const r of S.receitas.filter(r => r.produto_id === pid)) mat += custoIns(r.insumo_id) * r.quantidade;
  const mo = S.custoProd[pid] ?? 0;
  return { mat, mo, total: mat + mo };
}
const pctVar = c => (n(c.impostos) + n(c.comissao) + n(c.despesas)) / 100;
function margem(preco, custo, c = S.cfg) { return preco > 0 ? (preco - custo - preco * pctVar(c)) / preco : NaN; }
function sugerido(custo, c = S.cfg) { const d = 1 - (n(c.impostos) + n(c.comissao) + n(c.despesas) + n(c.margem)) / 100; return d > 0 ? custo / d : NaN; }
const clsMargem = m => !isFinite(m) ? '' : m < 0 ? 'neg' : m < 0.08 ? 'wrn' : 'pos';

/* ================= DADOS ================= */
async function carregarDados() {
  const q = [
    sb.from('v_produtos').select('*').order('nome'),
    sb.from('insumos').select('*').order('nome'),
    sb.from('receitas').select('*'),
    sb.from('lotes').select('*').gt('saldo', 0).order('validade'),
    sb.from('v_pedidos').select('*').order('id', { ascending: false }).limit(400),
    sb.from('movimentos').select('*').order('id', { ascending: false }).limit(600),
  ];
  if (ehAdmin()) q.push(
    sb.from('insumo_custos').select('*'), sb.from('produto_custos').select('*'),
    sb.from('config').select('*').eq('id', 1).maybeSingle(), sb.from('profiles').select('*').order('criado_em'),
  );
  const r = await Promise.all(q);
  const err = r.find(x => x.error); if (err) throw err.error;
  [S.produtos, S.insumos, S.receitas, S.lotes, S.pedidos, S.movs] = r.slice(0, 6).map(x => x.data || []);
  S.produtos.forEach(p => { for (const k of ['estoque', 'vencido', 'vence_15d', 'minimo', 'preco']) p[k] = n(p[k]); });
  S.insumos.forEach(i => { i.estoque = n(i.estoque); i.minimo = n(i.minimo); });
  S.receitas.forEach(x => x.quantidade = n(x.quantidade));
  S.lotes.forEach(l => { l.saldo = n(l.saldo); l.quantidade_inicial = n(l.quantidade_inicial); });
  S.pedidos.forEach(p => p.total = n(p.total));
  S.carregadoEm = Date.now();
  if (ehAdmin()) {
    S.custoIns = Object.fromEntries((r[6].data || []).map(x => [x.insumo_id, n(x.custo)]));
    S.custoProd = Object.fromEntries((r[7].data || []).map(x => [x.produto_id, n(x.mao_obra)]));
    if (r[8].data) S.cfg = r[8].data;
    S.usuarios = r[9].data || [];
  }
}
async function recarregar(silencioso) {
  try { if (!silencioso) carregando(true); await carregarDados(); desenhar(); }
  catch (e) { toast(erroTxt(e), true); }
  finally { carregando(false); }
}

/* ================= AUTENTICAÇÃO ================= */
let modoLogin = 'entrar';
$$('.seg button').forEach(b => b.onclick = () => {
  modoLogin = b.dataset.modo;
  $$('.seg button').forEach(x => x.classList.toggle('on', x === b));
  $('#campoNome').hidden = modoLogin !== 'cadastrar';
  $('#lgBtn').textContent = modoLogin === 'cadastrar' ? 'Criar conta' : 'Entrar';
  $('#lgSenha').autocomplete = modoLogin === 'cadastrar' ? 'new-password' : 'current-password';
  $('#lgMsg').textContent = '';
});
$('#formLogin').onsubmit = async e => {
  e.preventDefault();
  const email = $('#lgEmail').value.trim(), senha = $('#lgSenha').value, nome = $('#lgNome').value.trim(), msg = $('#lgMsg');
  msg.className = 'msg'; msg.textContent = '';
  if (!email || senha.length < 6) { msg.className = 'msg err'; msg.textContent = 'Informe e-mail e senha (mín. 6 caracteres).'; return; }
  if (modoLogin === 'cadastrar' && !nome) { msg.className = 'msg err'; msg.textContent = 'Informe seu nome.'; return; }
  carregando(true);
  try {
    if (modoLogin === 'cadastrar') {
      const { data, error } = await sb.auth.signUp({ email, password: senha, options: { data: { nome }, emailRedirectTo: location.origin + location.pathname } });
      if (error) throw error;
      if (!data.session) { msg.className = 'msg ok'; msg.textContent = 'Conta criada! Enviamos um link de confirmação para o seu e-mail. Confirme e depois entre.'; }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw error;
    }
  } catch (err) { msg.className = 'msg err'; msg.textContent = erroTxt(err); }
  finally { carregando(false); }
};
$('#lgEsqueci').onclick = async () => {
  const email = $('#lgEmail').value.trim(), msg = $('#lgMsg');
  if (!email) { msg.className = 'msg err'; msg.textContent = 'Digite seu e-mail acima e clique de novo.'; return; }
  carregando(true);
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  carregando(false);
  msg.className = 'msg ' + (error ? 'err' : 'ok');
  msg.textContent = error ? erroTxt(error) : 'Se o e-mail tiver conta, enviamos um link para criar uma nova senha.';
};
$('#formNovaSenha').onsubmit = async e => {
  e.preventDefault();
  const senha = $('#nsSenha').value, msg = $('#nsMsg');
  if (senha.length < 6) { msg.className = 'msg err'; msg.textContent = 'Mínimo de 6 caracteres.'; return; }
  carregando(true);
  const { error } = await sb.auth.updateUser({ password: senha });
  carregando(false);
  if (error) { msg.className = 'msg err'; msg.textContent = erroTxt(error); return; }
  recuperandoSenha = false; toast('Senha atualizada!'); history.replaceState(null, '', location.pathname); iniciarSessao();
};
const sair = async () => { await sb.auth.signOut(); };
$('#btnSair').onclick = sair; $('#pendSair').onclick = sair;
$('#pendRecarregar').onclick = () => iniciarSessao();
$('#btnAtualizar').onclick = () => recarregar();

let recuperandoSenha = false;
async function iniciarSessao() {
  const { data: { session } } = await sb.auth.getSession();
  S.sessao = session;
  if (recuperandoSenha) return telaAtiva('telaNovaSenha');
  if (!session) { telaAtiva('telaLogin'); carregando(false); return; }
  carregando(true);
  try {
    const { data, error } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (error) throw error;
    S.perfil = data || { papel: 'pendente', nome: session.user.email };
    if (S.perfil.papel === 'pendente') { $('#pendEmail').textContent = session.user.email; telaAtiva('telaPendente'); return; }
    $('#quem').textContent = `${S.perfil.nome} · ${NOMES_PAPEL[S.perfil.papel]}`;
    await carregarDados();
    telaAtiva('telaApp');
    desenhar();
  } catch (e) { toast(erroTxt(e), true); telaAtiva('telaLogin'); }
  finally { carregando(false); }
}

/* ================= NAVEGAÇÃO ================= */
const TELAS = [
  { id: 'painel', nome: 'Painel', ver: () => true, fn: telaPainel },
  { id: 'pedidos', nome: 'Pedidos', ver: () => true, fn: telaPedidos, bdg: () => S.pedidos.filter(p => p.status === 'aberto').length },
  { id: 'estoque', nome: 'Estoque e lotes', ver: () => true, fn: telaEstoque },
  { id: 'producao', nome: 'Produção', ver: () => pode('producao'), fn: telaProducao },
  { id: 'insumos', nome: 'Insumos', ver: () => true, fn: telaInsumos },
  { id: 'historico', nome: 'Histórico', ver: () => true, fn: telaHistorico },
  { id: 'calculadora', nome: 'Custos e preços', ver: ehAdmin, fn: telaCalculadora },
  { id: 'cadastros', nome: 'Cadastros', ver: ehAdmin, fn: telaCadastros },
  { id: 'usuarios', nome: 'Usuários', ver: ehAdmin, fn: telaUsuarios, bdg: () => S.usuarios.filter(u => u.papel === 'pendente').length },
];
const telaAtual = () => { const h = location.hash.slice(1); const t = TELAS.find(x => x.id === h && x.ver()); return t || TELAS[0]; };
window.addEventListener('hashchange', () => {
  desenhar(); window.scrollTo({ top: 0 });
  // dados podem ter mudado em outro celular/computador: atualiza em segundo plano
  if (!$('#telaApp').hidden && (telaAtual().id === 'usuarios' || Date.now() - S.carregadoEm > 20000)) recarregar(true);
});
function desenhar() {
  if ($('#telaApp').hidden) return;
  const atual = telaAtual();
  $('#menu').innerHTML = TELAS.filter(t => t.ver()).map(t => {
    const b = t.bdg ? t.bdg() : 0;
    return `<a href="#${t.id}" class="${t === atual ? 'on' : ''}">${t.nome}${b ? `<span class="bdg">${b}</span>` : ''}</a>`;
  }).join('');
  $('#view').innerHTML = ''; $('#view').onclick = null;
  atual.fn($('#view'));
  $('#menu a.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

/* ================= PAINEL ================= */
function statusEstoque(est, min) {
  if (est <= 0) return '<span class="pill bad">Sem estoque</span>';
  if (est < min) return '<span class="pill warn">Abaixo do mínimo</span>';
  return '<span class="pill ok">OK</span>';
}
function pillValidade(iso) {
  const d = diasAte(iso);
  if (d < 0) return `<span class="pill bad">Vencido há ${-d}d</span>`;
  if (d <= 15) return `<span class="pill warn">Vence em ${d}d</span>`;
  return `<span class="pill ok">${fData(iso)}</span>`;
}
function telaPainel(v) {
  const baixosP = S.produtos.filter(p => p.ativo && p.estoque < p.minimo);
  const baixosI = S.insumos.filter(i => i.ativo && i.estoque < i.minimo);
  const abertos = S.pedidos.filter(p => p.status === 'aberto');
  const separados = S.pedidos.filter(p => p.status === 'separado');
  const vencendo = S.lotes.filter(l => diasAte(l.validade) <= 15).sort((a, b) => a.validade.localeCompare(b.validade));
  const mes = hojeISO().slice(0, 7);
  const vendasMes = S.pedidos.filter(p => p.status === 'entregue' && (p.atualizado_em || '').slice(0, 7) === mes).reduce((a, p) => a + p.total, 0);
  const k = [
    ['Pedidos em aberto', abertos.length, abertos.length ? 'gold' : '', '#pedidos'],
    ['Separados p/ entrega', separados.length, '', '#pedidos'],
    ['Produtos abaixo do mínimo', baixosP.length, baixosP.length ? 'bad' : 'ok', '#estoque'],
    ['Insumos abaixo do mínimo', baixosI.length, baixosI.length ? 'bad' : 'ok', '#insumos'],
    ['Lotes vencendo / vencidos', vencendo.length, vencendo.length ? 'warn' : 'ok', '#estoque'],
    ['Entregue no mês', brl(vendasMes), '', '#pedidos'],
  ];
  if (ehAdmin()) {
    let vEst = 0, vIns = 0;
    S.produtos.forEach(p => vEst += custoProduto(p.id).total * p.estoque);
    S.insumos.forEach(i => vIns += custoIns(i.id) * Math.max(i.estoque, 0));
    const ms = S.produtos.filter(p => p.ativo).map(p => margem(p.preco, custoProduto(p.id).total)).filter(isFinite);
    const mm = ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : NaN;
    k.push(['Produto pronto (a custo)', brl(vEst), '', '#estoque'], ['Insumos (a custo)', brl(vIns), '', '#insumos'], ['Margem líquida média', pct(mm), mm < 0 ? 'bad' : '', '#calculadora']);
  }
  const proxEntregas = [...abertos, ...separados].sort((a, b) => (a.data_entrega || '9999').localeCompare(b.data_entrega || '9999')).slice(0, 8);
  v.innerHTML = `
    <div class="cab"><div><h2>Olá, ${esc(S.perfil.nome.split(' ')[0])}</h2><p class="hint">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div></div>
    <div class="grid kpis">${k.map(([l, val, c, href]) => `<a class="card kpi click" href="${href}" style="text-decoration:none;color:inherit"><div class="l">${l}</div><div class="v ${c}">${val}</div></a>`).join('')}</div>
    <div class="grid dois mt">
      <div class="card"><h3>Próximas entregas</h3><ul class="lista">${proxEntregas.length ? proxEntregas.map(p => `<li><span>#${p.id} · ${esc(p.cliente)} ${pillStatus(p.status)}</span><span class="hint">${p.data_entrega ? fData(p.data_entrega) : 'sem data'} · ${brl(p.total)}</span></li>`).join('') : '<li class="vazio">Nenhum pedido pendente.</li>'}</ul></div>
      <div class="card"><h3>Lotes vencendo em 15 dias ou vencidos</h3><ul class="lista">${vencendo.length ? vencendo.slice(0, 10).map(l => `<li><span>${esc(prodById(l.produto_id)?.nome)} <span class="hint">· ${esc(l.codigo)} · ${num(l.saldo)} un.</span></span>${pillValidade(l.validade)}</li>`).join('') : '<li class="vazio">Nenhum lote perto do vencimento.</li>'}</ul></div>
      <div class="card"><h3>Produtos abaixo do mínimo</h3><ul class="lista">${baixosP.length ? baixosP.map(p => `<li><span>${esc(p.nome)}</span><span class="${p.estoque <= 0 ? 'neg' : 'wrn'}">${num(p.estoque)} / mín. ${num(p.minimo)}</span></li>`).join('') : '<li class="vazio">Tudo acima do mínimo. 👑</li>'}</ul></div>
      <div class="card"><h3>Insumos abaixo do mínimo</h3><ul class="lista">${baixosI.length ? baixosI.map(i => `<li><span>${esc(i.nome)}</span><span class="${i.estoque <= 0 ? 'neg' : 'wrn'}">${num(i.estoque, 3)} / mín. ${num(i.minimo, 3)} ${esc(i.unidade)}</span></li>`).join('') : '<li class="vazio">Tudo acima do mínimo.</li>'}</ul></div>
    </div>`;
}

/* ================= PEDIDOS ================= */
const pillStatus = s => ({ aberto: '<span class="pill info">Aberto</span>', separado: '<span class="pill warn">Separado</span>', entregue: '<span class="pill ok">Entregue</span>', cancelado: '<span class="pill mute">Cancelado</span>' }[s] || s);
const telWa = t => { const d = String(t || '').replace(/\D/g, ''); return d ? (d.length <= 11 ? '55' + d : d) : ''; };

function telaPedidos(v) {
  const f = S.filtroPed;
  const lista = S.pedidos.filter(p => f === 'ativos' ? ['aberto', 'separado'].includes(p.status) : f === 'todos' ? true : p.status === f);
  const cont = s => S.pedidos.filter(p => s === 'ativos' ? ['aberto', 'separado'].includes(p.status) : p.status === s).length;
  v.innerHTML = `
    <div class="cab"><div><h2>Pedidos</h2><p class="hint">Aberto → Separado (baixa do estoque pelos lotes que vencem primeiro) → Entregue.</p></div>
      ${pode('pedido_editar') ? '<button class="btn" id="novoPed">+ Novo pedido</button>' : ''}</div>
    <div class="filtros">${[['ativos', 'Em andamento'], ['aberto', 'Abertos'], ['separado', 'Separados'], ['entregue', 'Entregues'], ['cancelado', 'Cancelados'], ['todos', 'Todos']]
      .map(([k, l]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${l}${k !== 'todos' ? ` (${cont(k)})` : ''}</button>`).join('')}</div>
    <div class="peds">${lista.length ? lista.map(cardPedido).join('') : '<p class="vazio">Nenhum pedido aqui.</p>'}</div>`;
  $$('.filtros button', v).forEach(b => b.onclick = () => { S.filtroPed = b.dataset.f; desenhar(); });
  $('#novoPed', v)?.addEventListener('click', () => formPedido(null));
  v.onclick = e => {
    const b = e.target.closest('[data-acao]'); if (!b) return;
    const id = +b.dataset.id, p = S.pedidos.find(x => x.id === id);
    ({ ver: () => verPedido(id), editar: () => formPedido(p), separar: () => separar(p), entregar: () => entregar(p), cancelar: () => cancelar(p) })[b.dataset.acao]?.();
  };
}
function cardPedido(p) {
  const atras = p.data_entrega && ['aberto', 'separado'].includes(p.status) && diasAte(p.data_entrega) < 0;
  const ac = [`<button class="btn ghost sm" data-acao="ver" data-id="${p.id}">Detalhes</button>`];
  if (p.status === 'aberto' && pode('pedido_editar')) ac.push(`<button class="btn ghost sm" data-acao="editar" data-id="${p.id}">Editar</button>`);
  if (p.status === 'aberto' && pode('pedido_mover')) ac.push(`<button class="btn sm" data-acao="separar" data-id="${p.id}">Separar</button>`);
  if (p.status === 'separado' && pode('pedido_mover')) ac.push(`<button class="btn ok sm" data-acao="entregar" data-id="${p.id}">Entregue</button>`);
  if (['aberto', 'separado'].includes(p.status) && pode('pedido_cancelar')) ac.push(`<button class="btn danger sm" data-acao="cancelar" data-id="${p.id}">Cancelar</button>`);
  return `<div class="ped">
    <div class="t"><div><div class="cli">${esc(p.cliente)}</div><div class="meta">Pedido #${p.id} · ${p.qtd_itens} ${p.qtd_itens == 1 ? 'item' : 'itens'}</div></div>${pillStatus(p.status)}</div>
    <div class="row between"><span class="meta">Entrega: <span class="${atras ? 'neg' : ''}">${p.data_entrega ? fData(p.data_entrega) : '—'}${atras ? ' (atrasado)' : ''}</span></span><span class="total" style="font-size:17px">${brl(p.total)}</span></div>
    ${p.telefone ? `<div class="meta">📞 ${esc(p.telefone)}${telWa(p.telefone) ? ` · <a href="https://wa.me/${telWa(p.telefone)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}</div>` : ''}
    <div class="acoes">${ac.join('')}</div></div>`;
}
async function itensDoPedido(id) {
  const { data, error } = await sb.from('pedido_itens').select('*, pedido_item_lotes(quantidade, lote_id)').eq('pedido_id', id).order('id');
  if (error) throw error;
  return data;
}
async function verPedido(id) {
  const p = S.pedidos.find(x => x.id === id);
  carregando(true);
  try {
    const itens = await itensDoPedido(id);
    const lotesIds = [...new Set(itens.flatMap(i => i.pedido_item_lotes.map(x => x.lote_id)))];
    let lotes = [];
    if (lotesIds.length) { const r = await sb.from('lotes').select('id,codigo,validade').in('id', lotesIds); lotes = r.data || []; }
    const msgWa = encodeURIComponent(`Olá, ${p.cliente}! Aqui é da Rainha do Alho 👑\nSeu pedido #${p.id}:\n` + itens.map(i => `• ${num(i.quantidade)}× ${prodById(i.produto_id)?.nome}`).join('\n') + `\nTotal: ${brl(p.total)}`);
    abrirModal(`
      <div class="dlg-h"><h3>Pedido #${p.id} ${pillStatus(p.status)}</h3><button class="x" data-fechar style="width:40px">✕</button></div>
      <div class="dlg-b">
        <p style="margin:0 0 4px"><b>${esc(p.cliente)}</b></p>
        <p class="hint" style="margin:0 0 12px">${[p.telefone, p.endereco].filter(Boolean).map(esc).join(' · ') || 'Sem contato'}<br>Entrega: ${p.data_entrega ? fData(p.data_entrega) : '—'} · Criado por ${esc(p.criado_por_nome || '—')} em ${fDataHora(p.criado_em)}</p>
        <div class="tbl"><table><thead><tr><th>Produto</th><th class="n">Qtd</th><th class="n">Preço</th><th class="n">Subtotal</th><th>Lotes</th></tr></thead><tbody>
        ${itens.map(i => `<tr><td>${esc(prodById(i.produto_id)?.nome)}</td><td class="n">${num(i.quantidade)}</td><td class="n">${brl(i.preco_unit)}</td><td class="n">${brl(i.quantidade * i.preco_unit)}</td>
          <td>${i.pedido_item_lotes.length ? i.pedido_item_lotes.map(x => { const l = lotes.find(y => y.id === x.lote_id); return `${esc(l?.codigo)} (${num(x.quantidade)})`; }).join(', ') : '<span class="hint">—</span>'}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="row between mt"><span class="hint">Total</span><span class="total">${brl(p.total)}</span></p>
        ${p.observacao ? `<p class="hint" style="white-space:pre-line">📝 ${esc(p.observacao)}</p>` : ''}
      </div>
      <div class="dlg-f">${telWa(p.telefone) ? `<a class="btn ghost" href="https://wa.me/${telWa(p.telefone)}?text=${msgWa}" target="_blank" rel="noopener">Enviar resumo no WhatsApp</a>` : '<span></span>'}<button class="btn ghost" data-fechar>Fechar</button></div>`);
  } catch (e) { toast(erroTxt(e), true); } finally { carregando(false); }
}
async function formPedido(p) {
  let itens = [];
  if (p) { carregando(true); try { itens = (await itensDoPedido(p.id)).map(i => ({ produto_id: i.produto_id, quantidade: n(i.quantidade), preco_unit: n(i.preco_unit) })); } catch (e) { carregando(false); return toast(erroTxt(e), true); } carregando(false); }
  if (!itens.length) itens = [{ produto_id: null, quantidade: 1, preco_unit: '' }];
  const prods = S.produtos.filter(x => x.ativo).sort(byNome);
  abrirModal(`
    <div class="dlg-h"><h3>${p ? 'Editar pedido #' + p.id : 'Novo pedido'}</h3><button class="x" data-fechar style="width:40px">✕</button></div>
    <div class="dlg-b">
      <div class="form">
        <div class="full-col"><label for="pdCli">Cliente</label><input id="pdCli" value="${esc(p?.cliente)}" placeholder="Nome do cliente ou estabelecimento"></div>
        <div><label for="pdTel">Telefone / WhatsApp</label><input id="pdTel" inputmode="tel" value="${esc(p?.telefone)}" placeholder="41 99999-9999"></div>
        <div><label for="pdData">Data de entrega</label><input id="pdData" type="date" value="${esc(p?.data_entrega || '')}"></div>
        <div class="full-col"><label for="pdEnd">Endereço</label><input id="pdEnd" value="${esc(p?.endereco)}"></div>
      </div>
      <h3 class="mt2">Produtos</h3>
      <div class="itens" id="pdItens"></div>
      <button class="btn ghost sm" id="pdAdd">+ Adicionar produto</button>
      <div class="form mt"><div class="full-col"><label for="pdObs">Observação</label><textarea id="pdObs">${esc(p?.observacao)}</textarea></div></div>
      <p class="row between mt"><span class="hint">Total do pedido</span><span class="total" id="pdTotal"></span></p>
    </div>
    <div class="dlg-f"><button class="btn ghost" data-fechar>Cancelar</button><button class="btn" id="pdSalvar">Salvar pedido</button></div>`);
  const box = $('#pdItens');
  const desenhaItens = () => {
    box.innerHTML = itens.map((it, k) => {
      const pr = prodById(it.produto_id);
      return `<div class="it">
        <div><label>Produto</label><select data-k="${k}" data-f="produto_id"><option value="">Escolha…</option>${prods.map(x => `<option value="${x.id}" ${x.id === it.produto_id ? 'selected' : ''}>${esc(x.nome)} — ${num(x.estoque)} em estoque</option>`).join('')}</select></div>
        <div><label>Qtd</label><input data-k="${k}" data-f="quantidade" type="number" min="0" step="any" inputmode="decimal" value="${it.quantidade}"></div>
        <div class="ps"><label>Preço un.</label><input data-k="${k}" data-f="preco_unit" type="number" min="0" step="0.01" inputmode="decimal" value="${it.preco_unit === '' ? (pr ? pr.preco : '') : it.preco_unit}"></div>
        <button class="x" data-del="${k}" title="Remover">✕</button></div>`;
    }).join('');
    total();
  };
  const total = () => $('#pdTotal').textContent = brl(itens.reduce((a, it) => a + n(it.quantidade) * n(it.preco_unit === '' ? prodById(it.produto_id)?.preco : it.preco_unit), 0));
  box.oninput = e => { const k = e.target.dataset.k; if (k === undefined) return; const f = e.target.dataset.f;
    if (f === 'produto_id') { itens[k].produto_id = +e.target.value || null; itens[k].preco_unit = ''; desenhaItens(); } else { itens[k][f] = e.target.value; total(); } };
  box.onclick = e => { const k = e.target.dataset.del; if (k !== undefined) { itens.splice(+k, 1); if (!itens.length) itens.push({ produto_id: null, quantidade: 1, preco_unit: '' }); desenhaItens(); } };
  $('#pdAdd').onclick = () => { itens.push({ produto_id: null, quantidade: 1, preco_unit: '' }); desenhaItens(); };
  desenhaItens();
  $('#pdSalvar').onclick = async () => {
    const cliente = $('#pdCli').value.trim();
    const lista = itens.filter(it => it.produto_id && n(it.quantidade) > 0).map(it => ({ produto_id: it.produto_id, quantidade: n(it.quantidade), preco_unit: it.preco_unit === '' ? prodById(it.produto_id).preco : n(it.preco_unit) }));
    if (!cliente) return toast('Informe o cliente.', true);
    if (!lista.length) return toast('Adicione pelo menos um produto com quantidade.', true);
    carregando(true);
    try {
      const id = await rpc('salvar_pedido', { p_id: p?.id ?? null, p_cliente: cliente, p_telefone: $('#pdTel').value.trim() || null, p_endereco: $('#pdEnd').value.trim() || null, p_observacao: $('#pdObs').value.trim() || null, p_data_entrega: $('#pdData').value || null, p_itens: lista });
      fecharModal(); toast(`Pedido #${id} salvo.`); S.filtroPed = 'ativos'; await recarregar(true);
    } catch (e) { toast(erroTxt(e), true); } finally { carregando(false); }
  };
}
async function separar(p) {
  if (!await confirmar(`Separar o pedido #${p.id} de ${p.cliente}?\nO estoque será baixado agora, começando pelos lotes que vencem primeiro.`, 'Separar')) return;
  carregando(true);
  try { await rpc('separar_pedido', { p_pedido: p.id }); toast(`Pedido #${p.id} separado. Estoque baixado.`); await recarregar(true); }
  catch (e) { toast(erroTxt(e), true); } finally { carregando(false); }
}
async function entregar(p) {
  if (!await confirmar(`Marcar o pedido #${p.id} de ${p.cliente} como entregue?`, 'Entregue')) return;
  carregando(true);
  try { await rpc('entregar_pedido', { p_pedido: p.id }); toast(`Pedido #${p.id} entregue. 👑`); await recarregar(true); }
  catch (e) { toast(erroTxt(e), true); } finally { carregando(false); }
}
async function cancelar(p) {
  abrirModal(`<div class="dlg-h"><h3>Cancelar pedido #${p.id}</h3><button class="x" data-fechar style="width:40px">✕</button></div>
    <div class="dlg-b"><p class="hint" style="margin-top:0">${p.status === 'separado' ? 'Os produtos voltam para os mesmos lotes de onde saíram.' : 'O pedido ainda não mexeu no estoque.'}</p>
    <label for="cnMot">Motivo</label><input id="cnMot" placeholder="Ex.: cliente desistiu"></div>
    <div class="dlg-f"><button class="btn ghost" data-fechar>Voltar</button><button class="btn danger" id="cnOk">Cancelar pedido</button></div>`);
  $('#cnOk').onclick = async () => {
    carregando(true);
    try { await rpc('cancelar_pedido', { p_pedido: p.id, p_motivo: $('#cnMot').value.trim() || null }); fecharModal(); toast(`Pedido #${p.id} cancelado.`); await recarregar(true); }
    catch (e) { toast(erroTxt(e), true); } finally { carregando(false); }
  };
}

/* ================= ESTOQUE / LOTES ================= */
function telaEstoque(v) {
  const q = S.buscaEst.toLowerCase();
  const lista = S.produtos.filter(p => p.ativo && p.nome.toLowerCase().includes(q));
  v.innerHTML = `
    <div class="cab"><div><h2>Estoque e lotes</h2><p class="hint">Produto pronto, por lote. Clique num produto para ver os lotes${pode('estoque') ? ' e ajustar' : ''}.</p></div>
      <input class="busca" id="bEst" placeholder="Buscar produto…" value="${esc(S.buscaEst)}"></div>
    <div class="tbl"><table><thead><tr><th>Produto</th><th class="n">Estoque</th><th class="n">Mínimo</th><th class="n">Vence ≤15d</th><th class="n">Vencido</th><th>Próx. validade</th><th>Status</th></tr></thead><tbody>
    ${lista.map(p => `<tr class="click" data-id="${p.id}"><td>${esc(p.nome)}</td><td class="n"><b>${num(p.estoque)}</b></td><td class="n">${num(p.minimo)}</td>
      <td class="n ${p.vence_15d ? 'wrn' : ''}">${num(p.vence_15d)}</td><td class="n ${p.vencido ? 'neg' : ''}">${num(p.vencido)}</td>
      <td>${p.proxima_validade ? fData(p.proxima_validade) : '—'}</td><td>${statusEstoque(p.estoque - p.vencido, p.minimo)}</td></tr>`).join('') || '<tr><td colspan="7" class="vazio">Nenhum produto.</td></tr>'}
    </tbody></table></div>`;
  const b = $('#bEst', v); b.oninput = () => { S.buscaEst = b.value; const pos = b.selectionStart; desenhar(); const nb = $('#bEst'); nb.focus(); nb.setSelectionRange(pos, pos); };
  $$('tr.click', v).forEach(tr => tr.onclick = () => verLotes(+tr.dataset.id));
}
async function verLotes(pid) {
  const p = prodById(pid);
  carregando(true);
  const { data, error } = await sb.from('lotes').select('*').eq('produto_id', pid).order('validade', { ascending: false }).limit(60);
  carregando(false);
  if (error) return toast(erroTxt(error), true);
  abrirModal(`
    <div class="dlg-h"><h3>${esc(p.nome)}</h3><button class="x" data-fechar style="width:40px">✕</button></div>
    <div class="dlg-b">
      <p class="hint" style="margin-top:0">Em estoque: <b>${num(p.estoque)}</b> un.${p.vencido ? ` · <span class="neg">${num(p.vencido)} vencidas</span>` : ''} · Validade padrão: ${p.validade_dias} dias</p>
      <div class="tbl"><table><thead><tr><th>Lote</th><th>Fabricação</th><th>Validade</th><th class="n">Produzido</th><th class="n">Saldo</th>${pode('estoque') ? '<th></th>' : ''}</tr></thead><tbody>
      ${(data || []).map(l => `<tr><td>${esc(l.codigo)}</td><td>${fData(l.fabricacao)}</td><td>${n(l.saldo) > 0 ? pillValidade(l.validade) : fData(l.validade)}</td><td class="n">${num(l.quantidade_inicial)}</td><td class="n"><b>${num(l.saldo)}</b></td>
        ${pode('estoque') ? `<td><button class="btn ghost sm" data-aj="${l.id}" data-cod="${esc(l.codigo)}" data-saldo="${n(l.saldo)}">Ajustar</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="6" class="vazio">Nenhum lote ainda.</td></tr>'}
      </tbody></table></div>
      <div id="ajBox"></div>
    </div>
    <div class="dlg-f"><span></span><button class="btn ghost" data-fechar>Fechar</button></div>`);
  $$('[data-aj]', $('#modal')).forEach(b => b.onclick = () => {
    $('#ajBox').innerHTML = `<div class="card mt"><h3>Ajustar lote ${esc(b.dataset.cod)} (saldo ${num(b.dataset.saldo)})</h3>
      <div class="form"><div><label for="ajQ">Quantidade (− sai, + entra)</label><input id="ajQ" type="number" step="any" inputmode="decimal" placeholder="-2"></div>
      <div><label for="ajM">Motivo</label><select id="ajM"><option>Quebra / avaria</option><option>Vencido descartado</option><option>Contagem de estoque</option><option>Amostra / degustação</option><option>Outro</option></select></div>
      <div class="full-col"><label for="ajO">Detalhe (opcional)</label><input id="ajO"></div></div>
      <button class="btn mt" id="ajOk">Registrar ajuste</button></div>`;
    $('#ajOk').onclick = async () => {
      const q = n($('#ajQ').value); if (!q) return toast('Informe a quantidade.', true);
      carregando(true);
      try { await rpc('ajustar_lote', { p_lote: +b.dataset.aj, p_delta: q, p_motivo: [$('#ajM').value, $('#ajO').value.trim()].filter(Boolean).join(' – ') });
        toast('Ajuste registrado.'); fecharModal(); await recarregar(true); verLotes(pid); }
      catch (e) { toast(erroTxt(e), true); } finally { carregando(false); }
    };
    $('#ajQ').focus();
  });
}

/* ================= PRODUÇÃO ================= */
function telaProducao(v) {
  const prods = S.produtos.filter(p => p.ativo).sort(byNome);
  const ultimos = S.movs.filter(m => m.tipo === 'producao' || m.tipo === 'estoque_inicial').slice(0, 12);
  v.innerHTML = `
    <div class="cab"><div><h2>Registrar produção</h2><p class="hint">Gera um lote com validade e baixa os insumos da receita.</p></div></div>
    <div class="grid dois">
      <div class="card">
        <div class="form">
          <div class="full-col"><label for="prProd">Produto</label><select id="prProd"><option value="">Escolha…</option>${prods.map(p => `<option value="${p.id}">${esc(p.nome)}</option>`).join('')}</select></div>
          <div><label for="prQtd">Quantidade (un.)</label><input id="prQtd" type="number" min="0" step="any" inputmode="decimal"></div>
          <div><label for="prCod">Código do lote</label><input id="prCod" placeholder="automático"></div>
          <div><label for="prFab">Fabricação</label><input id="prFab" type="date" value="${hojeISO()}"></div>
          <div><label for="prVal">Validade</label><input id="prVal" type="date"></div>
          <div class="full-col"><label for="prObs">Observação</label><input id="prObs" placeholder="Turno, responsável, máquina…"></div>
          ${ehAdmin() ? `<div class="full-col"><label class="check"><input type="checkbox" id="prInicial"> Estoque inicial / lote antigo (não baixa insumos)</label></div>` : ''}
        </div>
        <button class="btn mt full" id="prOk">Registrar produção</button>
      </div>
      <div class="card"><h3>Insumos que serão usados</h3><div id="prPrev"><p class="vazio">Escolha o produto e a quantidade.</p></div></div>
    </div>
    <h3 class="mt2">Últimas produções</h3>
    <div class="tbl"><table><thead><tr><th>Data</th><th>Produto</th><th class="n">Qtd</th><th>Por</th><th>Obs.</th></tr></thead><tbody>
    ${ultimos.map(m => `<tr><td>${fDataHora(m.data)}</td><td>${esc(prodById(m.produto_id)?.nome)}${m.tipo === 'estoque_inicial' ? ' <span class="pill mute">inicial</span>' : ''}</td><td class="n">${num(m.quantidade)}</td><td>${esc(m.usuario_nome)}</td><td>${esc(m.observacao)}</td></tr>`).join('') || '<tr><td colspan="5" class="vazio">Nenhuma produção ainda.</td></tr>'}
    </tbody></table></div>`;
  const preview = () => {
    const p = prodById(+$('#prProd').value), q = n($('#prQtd').value), ini = $('#prInicial')?.checked;
    if (p && (!$('#prVal').dataset.manual || !$('#prVal').value)) { $('#prVal').value = somaDias($('#prFab').value || hojeISO(), p.validade_dias); $('#prVal').dataset.manual = ''; }
    if (!p) return $('#prPrev').innerHTML = '<p class="vazio">Escolha o produto e a quantidade.</p>';
    const rec = S.receitas.filter(r => r.produto_id === p.id);
    if (!rec.length) return $('#prPrev').innerHTML = '<p class="hint">Este produto não tem receita cadastrada; nenhum insumo será baixado.</p>';
    if (ini) return $('#prPrev').innerHTML = '<p class="hint">Estoque inicial: os insumos não serão baixados.</p>';
    $('#prPrev').innerHTML = `<div class="tbl"><table><thead><tr><th>Insumo</th><th class="n">Precisa</th><th class="n">Tem</th><th></th></tr></thead><tbody>${rec.map(r => {
      const i = insById(r.insumo_id), need = r.quantidade * q, falta = need > i.estoque + 1e-9;
      return `<tr><td>${esc(i.nome)}</td><td class="n">${num(need, 3)} ${esc(i.unidade)}</td><td class="n">${num(i.estoque, 3)}</td><td>${q ? (falta ? `<span class="pill bad">Falta ${num(need - i.estoque, 3)}</span>` : '<span class="pill ok">OK</span>') : ''}</td></tr>`; }).join('')}</tbody></table></div>
      ${ehAdmin() && q ? `<p class="hint">Custo desta produção: <b>${brl(custoProduto(p.id).total * q)}</b> (${brl(custoProduto(p.id).total)}/un.)</p>` : ''}`;
  };
  ['#prProd', '#prQtd', '#prFab', '#prInicial'].forEach(s => $(s, v)?.addEventListener('input', preview));
  $('#prVal', v).addEventListener('input', e => e.target.dataset.manual = '1');
  $('#prProd', v).addEventListener('change', () => { $('#prVal').dataset.manual = ''; preview(); });
  const enviar = async (permitirNeg = false) => {
    const pid = +$('#prProd').value, q = n($('#prQtd').value);
    if (!pid) return toast('Escolha o produto.', true);
    if (q <= 0) return toast('Informe a quantidade.', true);
    carregando(true);
    try {
      const lote = await rpc('registrar_producao', { p_produto: pid, p_quantidade: q, p_fabricacao: $('#prFab').value || null, p_validade: $('#prVal').value || null,
        p_codigo: $('#prCod').value.trim() || null, p_observacao: $('#prObs').value.trim() || null, p_permitir_negativo: permitirNeg, p_sem_consumir: !!$('#prInicial')?.checked });
      toast(`Lote ${lote.codigo} registrado: +${num(q)} ${prodById(pid).nome}.`);
      await recarregar(true);
    } catch (e) {
      carregando(false);
      if (e.hint === 'FALTA_INSUMO' && await confirmar(erroTxt(e) + '\n\nRegistrar mesmo assim? O estoque desses insumos ficará negativo até você lançar a compra.', 'Registrar mesmo assim')) return enviar(true);
      if (e.hint !== 'FALTA_INSUMO') toast(erroTxt(e), true);
    } finally { carregando(false); }
  };
  $('#prOk', v).onclick = () => enviar(false);
}

/* ================= INSUMOS ================= */
function telaInsumos(v) {
  const q = S.buscaIns.toLowerCase(), adm = ehAdmin();
  const lista = S.insumos.filter(i => i.ativo && i.nome.toLowerCase().includes(q));
  v.innerHTML = `
    <div class="cab"><div><h2>Insumos</h2><p class="hint">Matéria-prima e embalagens.${pode('estoque') ? ' Lance compras e ajustes por aqui.' : ''}</p></div>
      <input class="busca" id="bIns" placeholder="Buscar insumo…" value="${esc(S.buscaIns)}"></div>
    <div class="tbl"><table><thead><tr><th>Insumo</th><th class="n">Estoque</th><th class="n">Mínimo</th>${adm ? '<th class="n">Custo / un.</th><th class="n">Valor</th>' : ''}<th>Status</th>${pode('estoque') ? '<th></th>' : ''}</tr></thead><tbody>
    ${lista.map(i => `<tr><td>${esc(i.nome)}</td><td class="n ${i.estoque < 0 ? 'neg' : ''}"><b>${num(i.estoque, 3)}</b> ${esc(i.unidade)}</td><td class="n">${num(i.minimo, 3)}</td>
      ${adm ? `<td class="n">${brl(custoIns(i.id))}</td><td class="n">${brl(custoIns(i.id) * Math.max(i.estoque, 0))}</td>` : ''}<td>${statusEstoque(i.estoque, i.minimo)}</td>
      ${pode('estoque') ? `<td><button class="btn sm" data-compra="${i.id}">Compra</button> <button class="btn ghost sm" data-ajuste="${i.id}">Ajuste</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="7" class="vazio">Nenhum insumo.</td></tr>'}
    </tbody></table></div>`;
  const b = $('#bIns', v); b.oninput = () => { S.buscaIns = b.value; const pos = b.selectionStart; desenhar(); const nb = $('#bIns'); nb.focus(); nb.setSelectionRange(pos, pos); };
  $$('[data-compra]', v).forEach(x => x.onclick = () => formCompra(insById(+x.dataset.compra)));
  $$('[data-ajuste]', v).forEach(x => x.onclick = () => formAjusteIns(insById(+x.dataset.ajuste)));
}
function formCompra(i) {
  abrirModal(`<div class="dlg-h"><h3>Compra · ${esc(i.nome)}</h3><button class="x" data-fechar style="width:40px">✕</button></div>
    <div class="dlg-b"><div class="form">
      <div><label for="cpQ">Quantidade (${esc(i.unidade)})</label><input id="cpQ" type="number" min="0" step="any" inputmode="decimal"></div>
      <div><label for="cpV">Valor total pago (R$)</label><input id="cpV" type="number" min="0" step="0.01" inputmode="decimal"></div>
      <div class="full-col"><label for="cpO">Observação</label><input id="cpO" placeholder="Fornecedor, nota fiscal…"></div></div>
      <p class="hint" id="cpPrev">Estoque atual: ${num(i.estoque, 3)} ${esc(i.unidade)}${ehAdmin() ? ` · custo médio ${brl(custoIns(i.id))}/${esc(i.unidade)}` : ''}</p></div>
    <div class="dlg-f"><button class="btn ghost" data-fechar>Cancelar</button><button class="btn" id="cpOk">Registrar compra</button></div>`);
  const prev = () => { const q = n($('#cpQ').value), val = n($('#cpV').value); if (!ehAdmin() || !q || !val) return;
    const base = Math.max(i.estoque, 0), novo = (custoIns(i.id) * base + val) / (base + q);
    $('#cpPrev').innerHTML = `Preço desta compra: <b>${brl(val / q)}</b>/${esc(i.unidade)} · novo custo médio: <b>${brl(novo)}</b>`; };
  $('#cpQ').oninput = $('#cpV').oninput = prev; $('#cpQ').focus();
  $('#cpOk').onclick = async () => {
    const q = n($('#cpQ').value); if (q <= 0) return toast('Informe a quantidade.', true);
    carregando(true);
    try { await rpc('registrar_compra', { p_insumo: i.id, p_quantidade: q, p_valor_total: n($('#cpV').value), p_observacao: $('#cpO').value.trim() || null });
      fecharModal(); toast(`Compra registrada: +${num(q, 3)} ${i.unidade} de ${i.nome}.`); await recarregar(true); }
    catch (e) { toast(erroTxt(e), true); } finally { carregando(false); }
  };
}
function formAjusteIns(i) {
  abrirModal(`<div class="dlg-h"><h3>Ajuste · ${esc(i.nome)}</h3><button class="x" data-fechar style="width:40px">✕</button></div>
    <div class="dlg-b"><p class="hint" style="margin-top:0">Estoque atual: ${num(i.estoque, 3)} ${esc(i.unidade)}</p><div class="form">
      <div><label for="aiQ">Quantidade (− sai, + entra)</label><input id="aiQ" type="number" step="any" inputmode="decimal"></div>
      <div><label for="aiM">Motivo</label><select id="aiM"><option>Contagem de estoque</option><option>Perda / avaria</option><option>Uso fora da produção</option><option>Devolução ao fornecedor</option><option>Outro</option></select></div>
      <div class="full-col"><label for="aiO">Detalhe (opcional)</label><input id="aiO"></div></div></div>
    <div class="dlg-f"><button class="btn ghost" data-fechar>Cancelar</button><button class="btn" id="aiOk">Registrar ajuste</button></div>`);
  $('#aiQ').focus();
  $('#aiOk').onclick = async () => {
    const q = n($('#aiQ').value); if (!q) return toast('Informe a quantidade.', true);
    carregando(true);
    try { await rpc('ajustar_insumo', { p_insumo: i.id, p_delta: q, p_motivo: [$('#aiM').value, $('#aiO').value.trim()].filter(Boolean).join(' – ') });
      fecharModal(); toast('Ajuste registrado.'); await recarregar(true); }
    catch (e) { toast(erroTxt(e), true); } finally { carregando(false); }
  };
}

/* ================= HISTÓRICO ================= */
const TIPOS = { producao: 'Produção', estoque_inicial: 'Estoque inicial', consumo_producao: 'Consumo na produção', compra: 'Compra de insumo', ajuste_insumo: 'Ajuste de insumo', ajuste_lote: 'Ajuste de lote', saida_pedido: 'Saída por pedido', estorno_pedido: 'Estorno (cancelamento)' };
function nomeItemMov(m) { return m.produto_id ? prodById(m.produto_id)?.nome : m.insumo_id ? insById(m.insumo_id)?.nome : ''; }
function telaHistorico(v) {
  const f = S.filtroHist, lotes = Object.fromEntries(S.lotes.map(l => [l.id, l.codigo]));
  const lista = S.movs.filter(m => !f || m.tipo === f);
  v.innerHTML = `
    <div class="cab"><div><h2>Histórico</h2><p class="hint">Últimas ${S.movs.length} movimentações de estoque.</p></div>
      <div class="row"><select id="hF" style="width:auto"><option value="">Todos os tipos</option>${Object.entries(TIPOS).map(([k, l]) => `<option value="${k}" ${f === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn ghost" id="hCsv">Exportar CSV</button></div></div>
    <div class="tbl"><table><thead><tr><th>Data</th><th>Tipo</th><th>Item</th><th class="n">Qtd</th><th>Lote / pedido</th><th>Por</th><th>Obs.</th></tr></thead><tbody>
    ${lista.map(m => `<tr><td>${fDataHora(m.data)}</td><td>${TIPOS[m.tipo] || m.tipo}</td><td>${esc(nomeItemMov(m))}</td><td class="n ${m.quantidade < 0 ? 'neg' : 'pos'}">${m.quantidade > 0 ? '+' : ''}${num(m.quantidade, 3)}</td>
      <td>${[m.lote_id ? (lotes[m.lote_id] || 'lote ' + m.lote_id) : '', m.pedido_id ? '#' + m.pedido_id : ''].filter(Boolean).map(esc).join(' · ')}</td><td>${esc(m.usuario_nome)}</td><td>${esc(m.observacao)}</td></tr>`).join('') || '<tr><td colspan="7" class="vazio">Nada por aqui.</td></tr>'}
    </tbody></table></div>`;
  $('#hF', v).onchange = e => { S.filtroHist = e.target.value; desenhar(); };
  $('#hCsv', v).onclick = () => {
    const linhas = lista.map(m => [fDataHora(m.data), TIPOS[m.tipo] || m.tipo, nomeItemMov(m), String(m.quantidade).replace('.', ','), m.lote_id ? (lotes[m.lote_id] || m.lote_id) : '', m.pedido_id || '', m.usuario_nome || '', m.observacao || '']
      .map(x => '"' + String(x).replace(/"/g, '""') + '"').join(';'));
    baixar(`historico-rainha-${hojeISO()}.csv`, '﻿' + ['data;tipo;item;quantidade;lote;pedido;usuario;observacao', ...linhas].join('\n'), 'text/csv');
  };
}

/* ================= CALCULADORA (admin) ================= */
let calcSel = null, calcCfg = null, calcPreco = null, calcFrete = 0;
function telaCalculadora(v) {
  const prods = S.produtos.filter(p => p.ativo).sort(byNome);
  if (!calcSel || !prodById(calcSel)) calcSel = prods[0]?.id;
  if (!calcCfg) calcCfg = { ...S.cfg };
  v.innerHTML = `
    <div class="cab"><div><h2>Custos e preços</h2><p class="hint">O custo vem da receita × custo médio dos insumos + mão de obra. Só administradores veem esta tela.</p></div></div>
    <div class="grid dois">
      <div class="card"><div class="form">
        <div class="full-col"><label for="cP">Produto</label><select id="cP">${prods.map(p => `<option value="${p.id}" ${p.id === calcSel ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></div>
        <div><label for="cI">Impostos (%)</label><input id="cI" type="number" step="0.1" min="0" value="${n(calcCfg.impostos)}"></div>
        <div><label for="cC">Comissão / taxas (%)</label><input id="cC" type="number" step="0.1" min="0" value="${n(calcCfg.comissao)}"></div>
        <div><label for="cD">Despesas fixas (%)</label><input id="cD" type="number" step="0.1" min="0" value="${n(calcCfg.despesas)}"></div>
        <div><label for="cM">Margem desejada (%)</label><input id="cM" type="number" step="0.1" min="0" value="${n(calcCfg.margem)}"></div>
        <div><label for="cF">Frete / extra por un. (R$)</label><input id="cF" type="number" step="0.01" min="0" value="${calcFrete}"></div>
        <div><label for="cA">Preço atual (R$)</label><input id="cA" type="number" step="0.01" min="0"></div>
      </div>
      <div class="row mt"><button class="btn ghost sm" id="cSalvarCfg">Salvar % como padrão</button><span class="hint">Preço = custo ÷ (1 − soma dos % ÷ 100)</span></div></div>
      <div class="card"><h3>Composição do custo (por unidade)</h3><div class="tbl" style="border:none"><table><tbody id="cBreak"></tbody></table></div></div>
    </div>
    <div class="grid kpis mt" id="cRes"></div>
    <div class="card mt"><h3>Para onde vai o preço sugerido</h3><div class="bar" id="cBar"></div><div class="legend" id="cLeg"></div>
      <div class="row mt"><button class="btn" id="cAplicar">Aplicar preço sugerido ao produto</button></div></div>
    <h3 class="mt2">Todos os produtos (com os % acima)</h3>
    <div class="tbl"><table><thead><tr><th>Produto</th><th class="n">Custo un.</th><th class="n">Preço atual</th><th class="n">Margem atual</th><th class="n">Lucro / un.</th><th class="n">Preço sugerido</th><th class="n">Diferença</th></tr></thead><tbody id="cSim"></tbody></table></div>`;
  const ler = () => { calcCfg = { impostos: n($('#cI').value), comissao: n($('#cC').value), despesas: n($('#cD').value), margem: n($('#cM').value) }; calcFrete = n($('#cF').value); };
  const calc = () => {
    ler();
    const p = prodById(calcSel); if (!p) return;
    if (calcPreco === null) { calcPreco = p.preco; $('#cA').value = p.preco; }
    const cp = custoProduto(p.id), custo = cp.total + calcFrete, preco = n($('#cA').value), sug = sugerido(custo, calcCfg), soma = n(calcCfg.impostos) + n(calcCfg.comissao) + n(calcCfg.despesas) + n(calcCfg.margem);
    $('#cBreak').innerHTML = S.receitas.filter(r => r.produto_id === p.id).map(r => { const i = insById(r.insumo_id); return `<tr><td>${esc(i?.nome)}</td><td class="n hint">${num(r.quantidade, 3)} ${esc(i?.unidade)} × ${brl(custoIns(r.insumo_id))}</td><td class="n">${brl(custoIns(r.insumo_id) * r.quantidade)}</td></tr>`; }).join('')
      + `<tr><td>Mão de obra</td><td></td><td class="n">${brl(cp.mo)}</td></tr>${calcFrete ? `<tr><td>Frete / extra</td><td></td><td class="n">${brl(calcFrete)}</td></tr>` : ''}<tr><td><b>Custo total</b></td><td></td><td class="n"><b>${brl(custo)}</b></td></tr>`;
    const m = margem(preco, custo, calcCfg), lucro = preco ? preco - custo - preco * pctVar(calcCfg) : NaN, minimo = (1 - pctVar(calcCfg)) > 0 ? custo / (1 - pctVar(calcCfg)) : NaN;
    $('#cRes').innerHTML = soma >= 100 ? `<div class="card" style="grid-column:1/-1"><span class="neg">A soma dos percentuais (${num(soma, 1)}%) precisa ser menor que 100%.</span></div>` :
      [['Custo por unidade', brl(custo), ''], ['Preço sugerido', brl(sug), 'gold'], ['Markup sobre custo', isFinite(sug) && custo ? num(sug / custo, 2) + '×' : '—', ''], ['Preço mínimo (lucro zero)', brl(minimo), ''],
       ['Margem do preço atual', pct(m), !isFinite(m) ? '' : m < 0 ? 'bad' : m < n(calcCfg.margem) / 100 - 0.005 ? 'warn' : 'ok'], ['Lucro por unidade', brl(lucro), lucro < 0 ? 'bad' : '']]
        .map(([l, val, c]) => `<div class="card kpi"><div class="l">${l}</div><div class="v ${c}">${val}</div></div>`).join('');
    if (soma < 100 && isFinite(sug) && sug > 0) {
      const partes = [['Custo', custo / sug, '#8a7a5c'], ['Impostos', n(calcCfg.impostos) / 100, '#d9468f'], ['Comissão/taxas', n(calcCfg.comissao) / 100, '#9a6fd1'], ['Despesas', n(calcCfg.despesas) / 100, '#4f8fbf'], ['Lucro', n(calcCfg.margem) / 100, '#7fbf8a']];
      $('#cBar').innerHTML = partes.map(([, x, cor]) => `<span style="width:${Math.max(x * 100, 0)}%;background:${cor}"></span>`).join('');
      $('#cLeg').innerHTML = partes.map(([l, x, cor]) => `<span><i style="background:${cor}"></i>${l} ${pct(x)} · ${brl(x * sug)}</span>`).join('');
      $('#cAplicar').disabled = false;
    } else { $('#cBar').innerHTML = $('#cLeg').innerHTML = ''; $('#cAplicar').disabled = true; }
    $('#cSim').innerHTML = S.produtos.filter(x => x.ativo).sort(byNome).map(x => {
      const c = custoProduto(x.id).total + (x.id === p.id ? calcFrete : 0), s = sugerido(c, calcCfg), mm = margem(x.preco, c, calcCfg), d = s - x.preco, l = x.preco - c - x.preco * pctVar(calcCfg);
      return `<tr><td>${esc(x.nome)}</td><td class="n">${brl(c)}</td><td class="n">${brl(x.preco)}</td><td class="n ${clsMargem(mm)}">${pct(mm)}</td><td class="n ${l < 0 ? 'neg' : ''}">${brl(l)}</td><td class="n">${brl(s)}</td><td class="n ${d > 0.005 ? 'neg' : 'pos'}">${isFinite(d) ? (d > 0 ? '+' : '') + brl(d) : '—'}</td></tr>`; }).join('');
  };
  $('#cP', v).onchange = e => { calcSel = +e.target.value; calcPreco = null; calcFrete = 0; $('#cF').value = 0; calc(); };
  ['#cI', '#cC', '#cD', '#cM', '#cF', '#cA'].forEach(s => $(s, v).addEventListener('input', calc));
  $('#cSalvarCfg', v).onclick = async () => {
    ler(); carregando(true);
    try { await rpc('salvar_config', { p_impostos: calcCfg.impostos, p_comissao: calcCfg.comissao, p_despesas: calcCfg.despesas, p_margem: calcCfg.margem }); S.cfg = { ...S.cfg, ...calcCfg }; toast('Percentuais salvos como padrão.'); }
    catch (e) { toast(erroTxt(e), true); } finally { carregando(false); }
  };
  $('#cAplicar', v).onclick = async () => {
    const p = prodById(calcSel), s = Math.round(sugerido(custoProduto(p.id).total + calcFrete, calcCfg) * 100) / 100;
    if (!isFinite(s) || !await confirmar(`Mudar o preço de "${p.nome}" de ${brl(p.preco)} para ${brl(s)}?\nNovos pedidos usarão o preço novo.`, 'Mudar preço')) return;
    carregando(true);
    try { await rpc('atualizar_preco', { p_produto: p.id, p_preco: s }); calcPreco = null; toast(`Preço atualizado para ${brl(s)}.`); await recarregar(true); }
    catch (e) { toast(erroTxt(e), true); } finally { carregando(false); }
  };
  calcPreco = null; calc();
}

/* ================= CADASTROS (admin) ================= */
let abaCad = 'produtos';
function telaCadastros(v) {
  const inativos = abaCad === 'produtos' ? S.produtos.filter(p => !p.ativo).length : S.insumos.filter(i => !i.ativo).length;
  v.innerHTML = `
    <div class="cab"><div><h2>Cadastros</h2><p class="hint">Produtos (preço, receita, validade) e insumos (custo, mínimo).</p></div>
      <button class="btn" id="cadNovo">+ Novo ${abaCad === 'produtos' ? 'produto' : 'insumo'}</button></div>
    <div class="filtros"><button data-a="produtos" class="${abaCad === 'produtos' ? 'on' : ''}">Produtos</button><button data-a="insumos" class="${abaCad === 'insumos' ? 'on' : ''}">Insumos</button></div>
    <div class="tbl"><table>${abaCad === 'produtos'
      ? `<thead><tr><th>Produto</th><th class="n">Preço</th><th class="n">Custo</th><th class="n">Margem</th><th class="n">Mínimo</th><th class="n">Validade</th><th></th></tr></thead><tbody>
        ${[...S.produtos].sort((a, b) => (b.ativo - a.ativo) || byNome(a, b)).map(p => { const c = custoProduto(p.id).total, m = margem(p.preco, c);
          return `<tr class="click" data-p="${p.id}" style="${p.ativo ? '' : 'opacity:.5'}"><td>${esc(p.nome)}${p.ativo ? '' : ' <span class="pill mute">inativo</span>'}</td><td class="n">${brl(p.preco)}</td><td class="n">${brl(c)}</td><td class="n ${clsMargem(m)}">${pct(m)}</td><td class="n">${num(p.minimo)}</td><td class="n">${p.validade_dias} d</td><td><button class="btn ghost sm">Editar</button></td></tr>`; }).join('')}</tbody>`
      : `<thead><tr><th>Insumo</th><th>Unid.</th><th class="n">Custo médio</th><th class="n">Mínimo</th><th>Usado em</th><th></th></tr></thead><tbody>
        ${[...S.insumos].sort((a, b) => (b.ativo - a.ativo) || byNome(a, b)).map(i => { const usos = S.receitas.filter(r => r.insumo_id === i.id).length;
          return `<tr class="click" data-i="${i.id}" style="${i.ativo ? '' : 'opacity:.5'}"><td>${esc(i.nome)}${i.ativo ? '' : ' <span class="pill mute">inativo</span>'}</td><td>${esc(i.unidade)}</td><td class="n">${brl(custoIns(i.id))}</td><td class="n">${num(i.minimo, 3)}</td><td>${usos} produto${usos === 1 ? '' : 's'}</td><td><button class="btn ghost sm">Editar</button></td></tr>`; }).join('')}</tbody>`}
    </table></div>
    ${inativos ? `<p class="hint">${inativos} inativo(s) aparecem esmaecidos — não somem do histórico.</p>` : ''}`;
  $$('.filtros button', v).forEach(b => b.onclick = () => { abaCad = b.dataset.a; desenhar(); });
  $('#cadNovo', v).onclick = () => abaCad === 'produtos' ? formProduto(null) : formInsumo(null);
  $$('[data-p]', v).forEach(tr => tr.onclick = () => formProduto(prodById(+tr.dataset.p)));
  $$('[data-i]', v).forEach(tr => tr.onclick = () => formInsumo(insById(+tr.dataset.i)));
}
function formProduto(p) {
  let rec = p ? S.receitas.filter(r => r.produto_id === p.id).map(r => ({ insumo_id: r.insumo_id, quantidade: r.quantidade })) : [];
  const ins = S.insumos.filter(i => i.ativo || rec.some(r => r.insumo_id === i.id)).sort(byNome);
  abrirModal(`<div class="dlg-h"><h3>${p ? 'Editar produto' : 'Novo produto'}</h3><button class="x" data-fechar style="width:40px">✕</button></div>
    <div class="dlg-b"><div class="form">
      <div class="full-col"><label for="fpN">Nome</label><input id="fpN" value="${esc(p?.nome)}" placeholder="Ex.: Alho Picado 1 kg"></div>
      <div><label for="fpP">Preço de venda (R$)</label><input id="fpP" type="number" min="0" step="0.01" value="${p?.preco ?? ''}"></div>
      <div><label for="fpMO">Mão de obra / un. (R$)</label><input id="fpMO" type="number" min="0" step="0.01" value="${p ? S.custoProd[p.id] ?? 0 : ''}"></div>
      <div><label for="fpMin">Estoque mínimo (un.)</label><input id="fpMin" type="number" min="0" step="any" value="${p?.minimo ?? ''}"></div>
      <div><label for="fpVal">Validade padrão (dias)</label><input id="fpVal" type="number" min="1" step="1" value="${p?.validade_dias ?? 90}"></div>
      ${p ? `<div class="full-col"><label class="check"><input type="checkbox" id="fpAtivo" ${p.ativo ? 'checked' : ''}> Produto ativo (desmarque para esconder sem apagar o histórico)</label></div>` : ''}
    </div>
    <h3 class="mt2">Receita: insumos por 1 unidade</h3>
    <p class="hint" style="margin-top:-6px">Inclua o rendimento: se 1 kg de alho picado usa 1,3 kg de alho in natura, coloque 1,3.</p>
    <div id="fpRec"></div><button class="btn ghost sm" id="fpAdd">+ Adicionar insumo</button>
    <div class="card mt" id="fpRes" style="padding:12px"></div></div>
    <div class="dlg-f"><button class="btn ghost" data-fechar>Cancelar</button><button class="btn" id="fpOk">Salvar</button></div>`);
  const des = () => {
    $('#fpRec').innerHTML = rec.length ? rec.map((r, k) => `<div class="itens"><div class="it" style="grid-template-columns:1fr 110px 50px 36px">
      <select data-k="${k}" data-f="insumo_id">${ins.map(i => `<option value="${i.id}" ${i.id === r.insumo_id ? 'selected' : ''}>${esc(i.nome)}</option>`).join('')}</select>
      <input data-k="${k}" data-f="quantidade" type="number" min="0" step="any" value="${r.quantidade}"><span class="hint">${esc(insById(r.insumo_id)?.unidade)}</span>
      <button class="x" data-del="${k}">✕</button></div></div>`).join('') : '<p class="vazio">Sem insumos na receita.</p>';
    res();
  };
  const res = () => { let mat = 0; rec.forEach(r => mat += custoIns(r.insumo_id) * n(r.quantidade)); const mo = n($('#fpMO').value), c = mat + mo, pr = n($('#fpP').value), m = margem(pr, c);
    $('#fpRes').innerHTML = `Materiais ${brl(mat)} + mão de obra ${brl(mo)} = <b>custo ${brl(c)}</b> · margem <b class="${clsMargem(m)}">${pct(m)}</b> · sugerido <b style="color:var(--gold)">${brl(sugerido(c))}</b>`; };
  $('#fpRec').oninput = e => { const k = e.target.dataset.k; if (k === undefined) return; const f = e.target.dataset.f; rec[k][f] = f === 'insumo_id' ? +e.target.value : e.target.value; f === 'insumo_id' ? des() : res(); };
  $('#fpRec').onclick = e => { const k = e.target.dataset.del; if (k !== undefined) { rec.splice(+k, 1); des(); } };
  $('#fpAdd').onclick = () => { const livre = ins.find(i => !rec.some(r => r.insumo_id === i.id)); if (!livre) return; rec.push({ insumo_id: livre.id, quantidade: 1 }); des(); };
  ['#fpMO', '#fpP'].forEach(s => $(s).oninput = res);
  des();
  $('#fpOk').onclick = async () => {
    const nome = $('#fpN').value.trim(); if (!nome) return toast('Informe o nome.', true);
    carregando(true);
    try {
      await rpc('salvar_produto', { p_id: p?.id ?? null, p_nome: nome, p_preco: n($('#fpP').value), p_minimo: n($('#fpMin').value), p_validade_dias: Math.max(1, Math.round(n($('#fpVal').value)) || 90),
        p_mao_obra: n($('#fpMO').value), p_receita: rec.filter(r => n(r.quantidade) > 0).map(r => ({ insumo_id: r.insumo_id, quantidade: n(r.quantidade) })), p_ativo: p ? $('#fpAtivo').checked : true });
      fecharModal(); toast('Produto salvo.'); await recarregar(true);
    } catch (e) { toast(erroTxt(e), true); } finally { carregando(false); }
  };
}
function formInsumo(i) {
  abrirModal(`<div class="dlg-h"><h3>${i ? 'Editar insumo' : 'Novo insumo'}</h3><button class="x" data-fechar style="width:40px">✕</button></div>
    <div class="dlg-b"><div class="form">
      <div class="full-col"><label for="fiN">Nome</label><input id="fiN" value="${esc(i?.nome)}" placeholder="Ex.: Alho in natura"></div>
      <div><label for="fiU">Unidade</label><select id="fiU">${['kg', 'un', 'L', 'g', 'm', 'cx'].map(u => `<option ${i?.unidade === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
      <div><label for="fiC">Custo por unidade (R$)</label><input id="fiC" type="number" min="0" step="0.0001" value="${i ? custoIns(i.id) : ''}"></div>
      <div><label for="fiM">Estoque mínimo</label><input id="fiM" type="number" min="0" step="any" value="${i?.minimo ?? ''}"></div>
      ${i ? `<div class="full-col"><label class="check"><input type="checkbox" id="fiA" ${i.ativo ? 'checked' : ''}> Insumo ativo</label></div>` : `<div><label for="fiE">Estoque inicial</label><input id="fiE" type="number" min="0" step="any" value="0"></div>`}
    </div>
    <p class="hint mt">${i ? 'O estoque muda por Compras e Ajustes (tela Insumos). O custo é atualizado sozinho pelo custo médio a cada compra com valor.' : 'Depois de criado, o estoque muda por Compras e Ajustes.'}</p></div>
    <div class="dlg-f"><button class="btn ghost" data-fechar>Cancelar</button><button class="btn" id="fiOk">Salvar</button></div>`);
  $('#fiOk').onclick = async () => {
    const nome = $('#fiN').value.trim(); if (!nome) return toast('Informe o nome.', true);
    carregando(true);
    try {
      await rpc('salvar_insumo', { p_id: i?.id ?? null, p_nome: nome, p_unidade: $('#fiU').value, p_minimo: n($('#fiM').value), p_custo: n($('#fiC').value), p_ativo: i ? $('#fiA').checked : true, p_estoque_inicial: i ? 0 : n($('#fiE').value) });
      fecharModal(); toast('Insumo salvo.'); await recarregar(true);
    } catch (e) { toast(erroTxt(e), true); } finally { carregando(false); }
  };
}

/* ================= USUÁRIOS (admin) ================= */
function telaUsuarios(v) {
  v.innerHTML = `
    <div class="cab"><div><h2>Usuários</h2><p class="hint">Quem cria conta fica “Aguardando liberação” até você escolher o nível de acesso.</p></div></div>
    <div class="grid dois">
      <div class="tbl"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Nível</th></tr></thead><tbody>
      ${S.usuarios.map(u => `<tr><td>${esc(u.nome)}${u.id === S.sessao.user.id ? ' <span class="pill mute">você</span>' : ''}</td><td>${esc(u.email)}</td>
        <td><select data-u="${u.id}" style="min-width:170px">${Object.entries(NOMES_PAPEL).map(([k, l]) => `<option value="${k}" ${u.papel === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`).join('')}
      </tbody></table></div>
      <div class="card"><h3>O que cada nível faz</h3><ul class="lista">
        <li><span><b>Administrador</b></span><span class="hint">Tudo: custos, preços, cadastros, usuários</span></li>
        <li><span><b>Produção</b></span><span class="hint">Produção, compras, ajustes, separar/entregar pedidos</span></li>
        <li><span><b>Vendas</b></span><span class="hint">Criar, editar, separar, entregar e cancelar pedidos</span></li>
        <li><span><b>Aguardando</b></span><span class="hint">Sem acesso</span></li></ul>
        <p class="hint">Produção e Vendas veem estoque, lotes e preços de venda, mas <b>não</b> veem custos nem margens.</p>
        <p class="hint">Para cadastrar alguém: peça para a pessoa abrir este site, clicar em <b>Criar conta</b> e depois libere aqui.</p></div>
    </div>`;
  $$('[data-u]', v).forEach(s => s.onchange = async () => {
    const u = S.usuarios.find(x => x.id === s.dataset.u);
    if (!await confirmar(`Mudar ${u.nome} para “${NOMES_PAPEL[s.value]}”?`)) { s.value = u.papel; return; }
    carregando(true);
    try { await rpc('definir_papel', { p_usuario: u.id, p_papel: s.value }); toast('Nível atualizado.'); await recarregar(true); }
    catch (e) { s.value = u.papel; toast(erroTxt(e), true); } finally { carregando(false); }
  });
}

/* ================= INÍCIO ================= */
if (!configurado) {
  carregando(false);
  document.body.innerHTML = `<div class="login"><div class="login-box"><img src="icons/logo.png" class="login-logo" alt=""><h1>Falta configurar</h1>
    <p class="hint center">Abra o arquivo <b>config.js</b> e cole a <b>Project URL</b> e a chave <b>anon</b> do seu projeto Supabase. Veja o passo a passo no README.</p></div></div>`;
} else {
  if (/type=recovery/.test(location.hash)) recuperandoSenha = true;
  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === 'PASSWORD_RECOVERY') { recuperandoSenha = true; telaAtiva('telaNovaSenha'); carregando(false); return; }
    if (evento === 'USER_UPDATED' && recuperandoSenha) { recuperandoSenha = false; return; }
    if (evento === 'SIGNED_OUT') { S.perfil = null; S.sessao = null; $('.seg button[data-modo=entrar]')?.click(); $('#lgSenha').value = ''; telaAtiva('telaLogin'); carregando(false); return; }
    if (evento === 'SIGNED_IN' && (!S.sessao || S.sessao.user.id !== sessao?.user.id)) setTimeout(iniciarSessao, 0);
  });
  iniciarSessao();
  let ultimaVolta = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !$('#telaApp').hidden && Date.now() - ultimaVolta > 60000 && !$('#modal').open) recarregar(true);
    if (document.visibilityState === 'hidden') ultimaVolta = Date.now();
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
