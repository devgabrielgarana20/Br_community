// ============================================================
// 🔑 CONFIGURAÇÃO DO JSONBIN.IO
// ============================================================

const API_KEY = '$2a$10$yTax8hI1OX74sK5cxit1HeW47jogzYPQk/4kMkfaDJmLP25Kwqa2u';
const BIN_ID = '6a3e8b37da38895dfe030d73';

// ============================================================
// 📌 CONFIGURAÇÃO DO PEERJS
// ============================================================

let peer = null;
let meuPeerId = null;
let conexoesAtivas = {};

// Inicializar PeerJS
function iniciarPeer(usuarioId) {
    return new Promise((resolve, reject) => {
        try {
            // Criar ID único baseado no usuário
            const peerId = `user_${usuarioId}`;
            
            peer = new Peer(peerId, {
                debug: 0,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ]
                }
            });

            peer.on('open', (id) => {
                meuPeerId = id;
                console.log('✅ PeerJS conectado! ID:', id);
                resolve(id);
            });

            peer.on('error', (err) => {
                console.error('❌ Erro PeerJS:', err);
                // Se o ID já estiver em uso, tenta com ID aleatório
                if (err.type === 'unavailable-id') {
                    const randomId = `user_${usuarioId}_${Date.now()}`;
                    peer = new Peer(randomId);
                    peer.on('open', (id) => {
                        meuPeerId = id;
                        resolve(id);
                    });
                } else {
                    reject(err);
                }
            });

            // Timeout de segurança
            setTimeout(() => {
                if (!meuPeerId) {
                    reject(new Error('Timeout ao conectar PeerJS'));
                }
            }, 10000);

        } catch (e) {
            console.error('❌ Erro ao iniciar PeerJS:', e);
            reject(e);
        }
    });
}

// Conectar a outro usuário
function conectarUsuario(usuarioId) {
    return new Promise((resolve, reject) => {
        if (!peer) {
            reject(new Error('Peer não inicializado'));
            return;
        }

        const targetId = `user_${usuarioId}`;
        
        // Se já estiver conectado, retorna a conexão
        if (conexoesAtivas[targetId]) {
            resolve(conexoesAtivas[targetId]);
            return;
        }

        const conn = peer.connect(targetId);
        
        conn.on('open', () => {
            console.log('✅ Conectado ao usuário:', targetId);
            conexoesAtivas[targetId] = conn;
            
            conn.on('data', (data) => {
                console.log('📩 Mensagem recebida de', targetId, ':', data);
                // Disparar evento para o app
                window.dispatchEvent(new CustomEvent('nova_mensagem_peer', {
                    detail: {
                        de: targetId,
                        dados: data
                    }
                }));
            });
            
            resolve(conn);
        });

        conn.on('error', (err) => {
            console.error('❌ Erro ao conectar:', err);
            reject(err);
        });

        // Timeout
        setTimeout(() => {
            reject(new Error('Timeout ao conectar'));
        }, 5000);
    });
}

// Enviar mensagem via PeerJS
async function enviarMensagemPeer(usuarioId, mensagem) {
    try {
        const targetId = `user_${usuarioId}`;
        let conn = conexoesAtivas[targetId];
        
        if (!conn) {
            conn = await conectarUsuario(usuarioId);
        }
        
        const dados = {
            texto: mensagem,
            de: meuPeerId,
            timestamp: new Date().toISOString()
        };
        
        conn.send(dados);
        return true;
    } catch (e) {
        console.error('❌ Erro ao enviar mensagem:', e);
        return false;
    }
}

// Escutar mensagens recebidas
function escutarMensagens(callback) {
    window.addEventListener('nova_mensagem_peer', (event) => {
        callback(event.detail);
    });
}

// ============================================================
// 🔄 FUNÇÕES DO JSONBIN.IO
// ============================================================

async function apiGet() {
    try {
        const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
            headers: { 'X-Master-Key': API_KEY }
        });
        if (!res.ok) throw new Error('Erro na API: ' + res.status);
        const data = await res.json();
        return data.record;
    } catch (e) {
        console.error('❌ Erro ao buscar:', e);
        return null;
    }
}

async function apiPut(dados) {
    try {
        const res = await fetch(`https://api.jsonbin.io/v3/b/${BIN_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-Master-Key': API_KEY
            },
            body: JSON.stringify(dados)
        });
        if (!res.ok) throw new Error('Erro ao salvar: ' + res.status);
        return true;
    } catch (e) {
        console.error('❌ Erro ao salvar:', e);
        return false;
    }
}

// ============================================================
// 🗃️ DADOS INICIAIS
// ============================================================

async function initDB() {
    let dados = await apiGet();
    if (!dados || !dados.usuarios) {
        const dadosIniciais = {
            usuarios: [{
                id: 1,
                nome: 'Administrador',
                email: 'admin@admin.com',
                senha: 'admin123',
                foto: 'https://avatars.githubusercontent.com/u/1?v=4',
                is_admin: true,
                is_banido: false,
                data_criacao: new Date().toISOString()
            }],
            grupos: [{
                id: 1,
                nome: '💬 Grupo Geral',
                descricao: 'Grupo para todos',
                admin_id: 1,
                foto: 'https://via.placeholder.com/44',
                is_public: true,
                data_criacao: new Date().toISOString(),
                membros: 1
            }],
            grupo_usuarios: [
                { usuario_id: 1, grupo_id: 1 }
            ],
            proximo_id: 2
        };
        await apiPut(dadosIniciais);
        return dadosIniciais;
    }
    return dados;
}

// ============================================================
// 👤 FUNÇÕES DE USUÁRIOS
// ============================================================

async function getUsuarios() {
    const dados = await apiGet();
    return dados?.usuarios || [];
}

async function criarUsuario(nome, email, senha, isAdmin = false) {
    const dados = await apiGet();
    if (!dados) return null;

    if (dados.usuarios.some(u => u.email === email)) {
        return { error: 'Email já cadastrado' };
    }

    const novoUsuario = {
        id: dados.proximo_id || 1,
        nome: nome,
        email: email,
        senha: senha,
        foto: 'https://via.placeholder.com/44',
        is_admin: isAdmin,
        is_banido: false,
        data_criacao: new Date().toISOString()
    };

    dados.usuarios.push(novoUsuario);
    dados.proximo_id = (dados.proximo_id || 1) + 1;

    await apiPut(dados);
    return novoUsuario;
}

async function banirUsuario(usuarioId) {
    const dados = await apiGet();
    if (!dados) return false;

    const usuario = dados.usuarios.find(u => u.id === usuarioId);
    if (!usuario || usuario.is_admin) return false;

    usuario.is_banido = !usuario.is_banido;
    await apiPut(dados);
    return true;
}

// ============================================================
// 📚 FUNÇÕES DE GRUPOS
// ============================================================

async function getGrupos() {
    const dados = await apiGet();
    return dados?.grupos || [];
}

async function getMeusGrupos(usuarioId) {
    const dados = await apiGet();
    if (!dados) return [];
    const membros = dados.grupo_usuarios.filter(gu => gu.usuario_id === usuarioId);
    const meusIds = membros.map(m => m.grupo_id);
    return dados.grupos.filter(g => meusIds.includes(g.id));
}

async function getGruposPublicos(usuarioId) {
    const dados = await apiGet();
    if (!dados) return [];
    const meusIds = dados.grupo_usuarios
        .filter(gu => gu.usuario_id === usuarioId)
        .map(gu => gu.grupo_id);
    return dados.grupos.filter(g => g.is_public && !meusIds.includes(g.id));
}

async function criarGrupo(nome, adminId) {
    const dados = await apiGet();
    if (!dados) return null;

    const novoGrupo = {
        id: dados.proximo_id || 1,
        nome: nome,
        descricao: '',
        admin_id: adminId,
        foto: 'https://via.placeholder.com/44',
        is_public: true,
        data_criacao: new Date().toISOString(),
        membros: 1
    };

    dados.grupos.push(novoGrupo);
    dados.grupo_usuarios.push({ usuario_id: adminId, grupo_id: novoGrupo.id });
    dados.proximo_id = (dados.proximo_id || 1) + 1;

    await apiPut(dados);
    return novoGrupo;
}

async function entrarGrupo(grupoId, usuarioId) {
    const dados = await apiGet();
    if (!dados) return false;

    const existe = dados.grupo_usuarios.some(
        gu => gu.usuario_id === usuarioId && gu.grupo_id === grupoId
    );
    if (existe) return false;

    dados.grupo_usuarios.push({ usuario_id: usuarioId, grupo_id: grupoId });
    const grupo = dados.grupos.find(g => g.id === grupoId);
    if (grupo) {
        grupo.membros = (grupo.membros || 0) + 1;
    }

    await apiPut(dados);
    return true;
}

async function sairGrupo(grupoId, usuarioId) {
    const dados = await apiGet();
    if (!dados) return false;

    dados.grupo_usuarios = dados.grupo_usuarios.filter(
        gu => !(gu.usuario_id === usuarioId && gu.grupo_id === grupoId)
    );

    const grupo = dados.grupos.find(g => g.id === grupoId);
    if (grupo) {
        grupo.membros = Math.max(0, (grupo.membros || 1) - 1);
    }

    await apiPut(dados);
    return true;
}

async function deletarGrupo(grupoId) {
    const dados = await apiGet();
    if (!dados) return false;

    dados.grupos = dados.grupos.filter(g => g.id !== grupoId);
    dados.grupo_usuarios = dados.grupo_usuarios.filter(gu => gu.grupo_id !== grupoId);

    await apiPut(dados);
    return true;
}

async function adicionarUsuarioAoGrupo(grupoId, usuarioId) {
    const dados = await apiGet();
    if (!dados) return false;

    const existe = dados.grupo_usuarios.some(
        gu => gu.usuario_id === usuarioId && gu.grupo_id === grupoId
    );
    if (existe) return false;

    dados.grupo_usuarios.push({ usuario_id: usuarioId, grupo_id: grupoId });
    const grupo = dados.grupos.find(g => g.id === grupoId);
    if (grupo) {
        grupo.membros = (grupo.membros || 0) + 1;
    }

    await apiPut(dados);
    return true;
}

// ============================================================
// 📩 FUNÇÕES DO CHAT (PEERJS)
// ============================================================

// Iniciar o chat
async function iniciarChat(usuarioId) {
    try {
        const peerId = await iniciarPeer(usuarioId);
        console.log('✅ Chat iniciado! ID:', peerId);
        return peerId;
    } catch (e) {
        console.error('❌ Erro ao iniciar chat:', e);
        return null;
    }
}

// Enviar mensagem para o grupo (todos os membros)
async function enviarMensagemGrupo(grupoId, mensagem, usuarioRemetente) {
    try {
        // Buscar todos os membros do grupo
        const dados = await apiGet();
        if (!dados) return false;

        const membros = dados.grupo_usuarios
            .filter(gu => gu.grupo_id === grupoId && gu.usuario_id !== usuarioRemetente)
            .map(gu => gu.usuario_id);

        console.log('📤 Enviando para membros:', membros);

        let sucessos = 0;
        for (const membroId of membros) {
            const enviou = await enviarMensagemPeer(membroId, mensagem);
            if (enviou) sucessos++;
        }

        console.log(`✅ Mensagem enviada para ${sucessos} de ${membros.length} membros`);
        return sucessos > 0;
    } catch (e) {
        console.error('❌ Erro ao enviar mensagem para o grupo:', e);
        return false;
    }
}

// ============================================================
// 🚀 EXPORTAR
// ============================================================

console.log('🚀 API carregada!');
console.log('📌 Usuários/Grupos: JSONBin.io');
console.log('📌 Chat: PeerJS (P2P)');
console.log('🔐 Admin: admin@admin.com / admin123');