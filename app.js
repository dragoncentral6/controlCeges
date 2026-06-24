// ==========================================================================
// IMPORTACIÓN DE CONFIGURACIÓN Y MÓDULOS DE FIREBASE
// ==========================================================================
import { db } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    doc, 
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ==========================================================================
// CONFIGURACIÓN GLOBAL Y ESTADOS
// ==========================================================================
let gruas = []; 
let filtroActual = 'todos';
let paginaActual = 1;
const filasPorPagina = 5;

// Referencia a la colección en Firestore
const gruasCollectionRef = collection(db, "gruas");

// Elementos del DOM - Navegación
const vistas = document.querySelectorAll('.vista');
const navBotones = document.querySelectorAll('.nav-btn');

// Elementos del DOM - Formulario
const formGrua = document.getElementById('form-grua');
const txtIdEdicion = document.getElementById('txt-id-edicion');
const txtPlaca = document.getElementById('txt-placa');
const txtAlias = document.getElementById('txt-alias');
const selectEstado = document.getElementById('select-estado');
const selectPosicion = document.getElementById('select-posicion');
const dateSoat = document.getElementById('date-soat');
const datePoliza = document.getElementById('date-poliza');
const dateRtm = document.getElementById('date-rtm');
const txtTelefono = document.getElementById('txt-telefono');
const txtObservaciones = document.getElementById('txt-observaciones');
const btnGuardar = document.getElementById('btn-guardar');
const btnCancelar = document.getElementById('btn-cancelar');
const tituloFormulario = document.getElementById('titulo-formulario');

// Elementos del DOM - Listados y Controles
const contenedorCards = document.getElementById('contenedor-cards');
const tbodyGruas = document.getElementById('tbody-gruas');
const txtBuscar = document.getElementById('txt-buscar');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const infoPaginas = document.getElementById('info-paginas');
const filtrosSutiles = document.querySelectorAll('.btn-filtro-sutil');

// ==========================================================================
// ESCUCHA EN TIEMPO REAL (FIRESTORE SNAPSHOT)
// ==========================================================================
onSnapshot(gruasCollectionRef, (snapshot) => {
    gruas = [];
    snapshot.forEach((doc) => {
        gruas.push({ id: doc.id, ...doc.data() });
    });
    
    renderizarVistaPrincipal();
    renderizarTablaAdministrativa();
});

// ==========================================================================
// LÓGICA DE NAVEGACIÓN ENTRE VISTAS
// ==========================================================================
function cambiarVista(targetVista) {
    navBotones.forEach(b => {
        const targetBtn = b.getAttribute('data-target');
        if (targetBtn === targetVista) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });

    vistas.forEach(v => {
        if (v.id === targetVista) {
            v.classList.add('active');
        } else {
            v.classList.remove('active');
        }
    });

    if (targetVista === 'vista-visualizar') {
        renderizarVistaPrincipal();
    } else if (targetVista === 'vista-registro') {
        renderizarTablaAdministrativa();
    }
}

navBotones.forEach(btn => {
    btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-target');
        cambiarVista(target);
    });
});

// ==========================================================================
// CÁLCULO LOGÍSTICO DE VENCIMIENTOS (ALERTAS + AUTO-INACTIVACIÓN SYNC)
// ==========================================================================
function evaluarAlertasGrua(grua) {
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    
    let tipoAlerta = 'normal'; 
    let documentosDetalle = [];
    let diasMinimos = Infinity;

    const fechasEvaluar = {
        'SOAT': grua.soat,
        'Póliza': grua.poliza,
        'RTM': grua.rtm
    };

    for (const [nombre, fechaStr] of Object.entries(fechasEvaluar)) {
        if (!fechaStr) continue;
        
        const fechaDoc = new Date(fechaStr + 'T00:00:00');
        const diferenciaTiempo = fechaDoc - hoy;
        const diferenciaDias = Math.ceil(diferenciaTiempo / (1000 * 60 * 60 * 24));

        if (diferenciaDias <= 0) {
            tipoAlerta = 'vencido';
            documentosDetalle.push(`${nombre} (Vencido)`);
        } else if (diferenciaDias <= 15 && tipoAlerta !== 'vencido') {
            tipoAlerta = 'proximo';
            documentosDetalle.push(`${nombre} (${diferenciaDias} d)`);
        }
        
        if (diferenciaDias < diasMinimos) {
            diasMinimos = diferenciaDias;
        }
    }

    // Si posee algún documento vencido y no está inactiva, se fuerza el cambio en Firestore
    if (tipoAlerta === 'vencido' && grua.estado !== 'inactivo' && grua.id) {
        const gruaDocRef = doc(db, "gruas", grua.id);
        updateDoc(gruaDocRef, {
            estado: 'inactivo',
            posicion: ''
        }).catch(err => console.error("Error en auto-inactivación: ", err));
    }

    return { tipoAlerta, detalle: documentosDetalle.join(', '), diasMinimos };
}

// ==========================================================================
// HELPER: OBTENER HORA ACTUAL EN FORMATO AM/PM
// ==========================================================================
function obtenerHoraActualAMPM() {
    const ahora = new Date();
    let horas = ahora.getHours();
    const minutos = ahora.getMinutes().toString().padStart(2, '0');
    const ampm = horas >= 12 ? 'PM' : 'AM';
    horas = horas % 12;
    horas = horas ? horas : 12; 
    const strHoras = horas.toString().padStart(2, '0');
    return `${strHoras}:${minutos} ${ampm}`;
}

// ==========================================================================
// RENDER VISTA 1: PLANILLA ULTRA COMPACTA
// ==========================================================================
function renderizarVistaPrincipal() {
    contenedorCards.innerHTML = '';
    
    const gruasFiltradas = gruas.filter(grua => {
        if (grua.visible === false) return false; 

        if (filtroActual === 'todos') return true;
        if (filtroActual === 'activo') return grua.estado === 'activo';
        if (filtroActual === 'inactivo') return grua.estado === 'inactivo';
        if (filtroActual === 'otros') return ['recorrido', 'operativo'].includes(grua.estado);
        return true;
    });

    // Doble Criterio de Ordenamiento: 1° Estado operativo, 2° Alias de menor a mayor (A-Z)
    gruasFiltradas.sort((a, b) => {
        const ordenOperativo = { 'inactivo': 1, 'activo': 2, 'operativo': 3, 'recorrido': 4 };
        const pesoA = ordenOperativo[a.estado] || 5;
        const pesoB = ordenOperativo[b.estado] || 5;

        if (pesoA !== pesoB) {
            return pesoA - pesoB;
        }
        
        const aliasA = (a.alias || '').toLowerCase();
        const aliasB = (b.alias || '').toLowerCase();
        return aliasA.localeCompare(aliasB);
    });

    if (gruasFiltradas.length === 0) {
        contenedorCards.innerHTML = `<div style="text-align:center; padding:20px; color:#94a3b8; font-size:0.75rem;">No hay grúas visibles en esta categoría.</div>`;
        return;
    }

    gruasFiltradas.forEach(grua => {
        const { tipoAlerta, detalle } = evaluarAlertasGrua(grua);
        const fila = document.createElement('div');
        fila.className = 'fila-lineal-grua';
        
        let alertaHTML = `<span class="espacio-alerta-alinhado-vacio"></span>`;
        if (tipoAlerta === 'vencido') {
            alertaHTML = `
                <div class="contenedor-alerta-tooltip" onclick="window.redireccionarAEdicion('${grua.id}')" title="Clic para corregir vencimiento">
                    <span class="emoji-alerta-interactivo vencido">❌</span>
                    <span class="tooltip-texto">¡VENCIDO! ${detalle}<br><small style="color:#60a5fa; font-weight:700;">(Clic para corregir)</small></span>
                </div>`;
        } else if (tipoAlerta === 'proximo') {
            alertaHTML = `
                <div class="contenedor-alerta-tooltip" onclick="window.redireccionarAEdicion('${grua.id}')" title="Clic para renovar documento">
                    <span class="emoji-alerta-interactivo proximo">⚠️</span>
                    <span class="tooltip-texto">Próximo: ${detalle}<br><small style="color:#60a5fa; font-weight:700;">(Clic para renovar)</small></span>
                </div>`;
        }

        fila.innerHTML = `
            <div class="celda-lineal celda-alias-alerta-bloque">
                <div class="contenedor-alias-recortado">
                    <span class="texto-alias-label" title="Placa: ${grua.placa}">${grua.alias}</span>
                </div>
                <span class="tooltip-placa">${grua.placa.toUpperCase()}</span>
            </div>

            <div class="celda-lineal celda-select">
                <select class="select-lineal-interactivo estado-${grua.estado}" data-id="${grua.id}">
                    <option value="activo" ${grua.estado === 'activo' ? 'selected' : ''}>ACTIVO</option>
                    <option value="inactivo" ${grua.estado === 'inactivo' ? 'selected' : ''}>INACTIVO</option>
                    <option value="recorrido" ${grua.estado === 'recorrido' ? 'selected' : ''}>RECORRIDO</option>
                    <option value="operativo" ${grua.estado === 'operativo' ? 'selected' : ''}>OPERATIVO</option>
                </select>
            </div>

            <div class="celda-lineal celda-select">
                <select class="select-lineal-interactivo select-posicion-plano" data-id="${grua.id}" ${grua.estado === 'inactivo' ? 'disabled' : ''}>
                    <option value="" ${grua.posicion === '' ? 'selected' : ''}>--</option>
                    <option value="QSY" ${grua.posicion === 'QSY' ? 'selected' : ''}>QSY</option>
								<option value="QAP" ${grua.posicion === 'QAP' ? 'selected' : ''}>QAP</option>
                    <option value="ruta" ${grua.posicion === 'ruta' ? 'selected' : ''}>RUTA</option>
                    <option value="patios" ${grua.posicion === 'patios' ? 'selected' : ''}>PATIOS</option>
                    <option value="CT" ${grua.posicion === 'CT' ? 'selected' : ''}>CT</option>
                </select>
            </div>

            <div class="celda-lineal celda-observacion">
                <input type="text" class="input-observacion-lineal" 
                       value="${grua.observaciones || ''}" 
                       placeholder="--" 
                       data-id="${grua.id}">
            </div>

            <div class="celda-lineal celda-alerta-final">${alertaHTML}</div>
        `;

        const selectEst = fila.querySelector('.select-lineal-interactivo:not(.select-posicion-plano)');
        const selectPos = fila.querySelector('.select-posicion-plano');
        const inputObs = fila.querySelector('.input-observacion-lineal');

        selectEst.addEventListener('change', (e) => {
            const nuevoEstado = e.target.value;

            // Bloqueo si posee documentos vencidos
            if (tipoAlerta === 'vencido' && nuevoEstado !== 'inactivo') {
                alert(`⚠️ NOTIFICACIÓN: No es posible cambiar el estado. La unidad posee documentos vencidos (${detalle}). Por favor actualice las fechas.`);
                e.target.value = 'inactivo';
                return;
            }

            if (nuevoEstado === 'inactivo') {
                const gruaDocRef = doc(db, "gruas", grua.id);
                updateDoc(gruaDocRef, { estado: nuevoEstado, posicion: '', observaciones: '' });
            } else {
                actualizarCampoGrua(grua.id, 'estado', nuevoEstado);
            }
        });

        selectPos.addEventListener('change', (e) => {
            const nuevaPosicion = e.target.value;
            actualizarCampoGrua(grua.id, 'posicion', nuevaPosicion);

            if (nuevaPosicion === '') {
                // Si escoge "--" (Vacío), formatea y borra las observaciones en Firebase e Interfaz
                actualizarCampoGrua(grua.id, 'observaciones', '');
                inputObs.value = '';
            } else {
                // Si escoge una posición válida, formatea la hora limpia sin corchetes
                const horaStr = obtenerHoraActualAMPM();
                actualizarCampoGrua(grua.id, 'observaciones', horaStr);
                inputObs.value = horaStr;
            }
        });

        inputObs.addEventListener('blur', (e) => {
            actualizarCampoGrua(grua.id, 'observaciones', e.target.value);
        });
        inputObs.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') inputObs.blur();
        });

        contenedorCards.appendChild(fila);
    });
}

function actualizarCampoGrua(id, campo, valor) {
    const gruaDocRef = doc(db, "gruas", id);
    updateDoc(gruaDocRef, { [campo]: valor })
        .catch(err => console.error("Error actualizando campo: ", err));
}

filtrosSutiles.forEach(btn => {
    btn.addEventListener('click', () => {
        filtrosSutiles.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filtroActual = btn.getAttribute('data-filtro') || 'todos';
        renderizarVistaPrincipal();
    });
});

// ==========================================================================
// RENDER VISTA 2: PANEL DE ADMINISTRACIÓN
// ==========================================================================
function renderizarTablaAdministrativa() {
    if (!tbodyGruas) return;
    tbodyGruas.innerHTML = '';
    const busqueda = txtBuscar.value.toLowerCase().trim();

    let filtradas = gruas.filter(g => 
        g.placa.toLowerCase().includes(busqueda) ||
        g.alias.toLowerCase().includes(busqueda) ||
        (g.observaciones && g.observaciones.toLowerCase().includes(busqueda))
    );

    filtradas.sort((a, b) => {
        const alertaA = evaluarAlertasGrua(a).tipoAlerta;
        const alertaB = evaluarAlertasGrua(b).tipoAlerta;
        const mapaPrioridad = { 'vencido': 1, 'proximo': 2, 'normal': 3 };
        const pesoA = mapaPrioridad[alertaA] || 3;
        const pesoB = mapaPrioridad[alertaB] || 3;

        if (pesoA !== pesoB) return pesoA - pesoB;
        return a.placa.localeCompare(b.placa);
    });

    const totalFilas = filtradas.length;
    const totalPaginas = Math.ceil(totalFilas / filasPorPagina) || 1;
    if (paginaActual > totalPaginas) paginaActual = totalPaginas;

    btnPrev.disabled = paginaActual === 1;
    btnNext.disabled = paginaActual === totalPaginas;
    infoPaginas.textContent = `Pág. ${paginaActual} de ${totalPaginas}`;

    const inicio = (paginaActual - 1) * filasPorPagina;
    const itemsPagina = filtradas.slice(inicio, inicio + filasPorPagina);

    if (itemsPagina.length === 0) {
        tbodyGruas.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:15px;">No se encontraron registros.</td></tr>`;
        return;
    }

    itemsPagina.forEach(grua => {
        const { tipoAlerta } = evaluarAlertasGrua(grua);
        const tr = document.createElement('tr');
        
        if (tipoAlerta === 'vencido') tr.className = 'fila-vencida';
        else if (tipoAlerta === 'proximo') tr.className = 'fila-proxima';

        const esVisible = grua.visible !== false;
        const emojiOjo = esVisible ? '👁️' : '🙈';
        const tituloOjo = esVisible ? 'Ocultar de Planilla Principal' : 'Mostrar en Planilla Principal';
        const claseOjo = esVisible ? '' : 'btn-oculto';

        tr.innerHTML = `
            <td style="font-weight:700; text-transform:uppercase;">${grua.placa}</td>
            <td>${grua.alias}</td>
            <td><span style="text-transform:uppercase; font-weight:600;">${grua.estado}</span></td>
            <td>${grua.posicion || '--'}</td>
            <td class="fechas-celda-tabla">
                <span class="${obtenerClaseFechaTexto(grua.soat)}">S: ${grua.soat || '--'}</span><br>
                <span class="${obtenerClaseFechaTexto(grua.poliza)}">P: ${grua.poliza || '--'}</span><br>
                <span class="${obtenerClaseFechaTexto(grua.rtm)}">R: ${grua.rtm || '--'}</span>
            </td>
            <td>
                <button type="button" class="btn-accion-tabla" data-id="${grua.id}" data-action="notify" title="Mandar Alerta al Gruero">🔔</button>
                <button type="button" class="btn-accion-tabla ${claseOjo}" data-id="${grua.id}" data-action="toggle-visibility" title="${tituloOjo}">${emojiOjo}</button>
                <button type="button" class="btn-accion-tabla" data-id="${grua.id}" data-action="edit" title="Editar">✏️</button>
                <button type="button" class="btn-accion-tabla" data-id="${grua.id}" data-action="delete" title="Eliminar">🗑️</button>
            </td>
        `;

        tr.querySelectorAll('.btn-accion-tabla').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = btn.getAttribute('data-id');
                const action = btn.getAttribute('data-action');
                if (action === 'notify') notificarGruero(id);
                if (action === 'toggle-visibility') conmutarVisibilidad(id);
                if (action === 'edit') cargarEdicionGrua(id);
                if (action === 'delete') eliminarGrua(id);
            });
        });

        tbodyGruas.appendChild(tr);
    });
}

function obtenerClaseFechaTexto(fechaStr) {
    if (!fechaStr) return '';
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    const fechaDoc = new Date(fechaStr + 'T00:00:00');
    const dias = Math.ceil((fechaDoc - hoy) / (1000 * 60 * 60 * 24));
    if (dias <= 0) return 'txt-vencido';
    if (dias <= 15) return 'txt-proximo';
    return '';
}

// ==========================================================================
// ACCIONES E INTERACCIONES DE BOTONES
// ==========================================================================
function notificarGruero(id) {
    const grua = gruas.find(g => g.id === id);
    if (!grua) return;

    if (!grua.telefono || grua.telefono.trim() === '') {
        alert(`No es posible enviar la alerta. La grúa con placa ${grua.placa} no tiene un número de teléfono registrado.`);
        return;
    }

    const { tipoAlerta, detalle } = evaluarAlertasGrua(grua);
    let mensaje = `*LOGÍSTICA CENTRAL CENTRAL-GRÚAS*\n\nEstimado operador de la unidad *${grua.alias}* (Placa: *${grua.placa}*):\n\n`;

    if (tipoAlerta === 'vencido') {
        mensaje += `⚠️ *ALERTA CRÍTICA DE DOCUMENTACIÓN*\nSe registra en el sistema un vencimiento inmediato en: *${detalle}*.\n\nPor seguridad vial y normatividad, por favor reporte la renovación o envíe soporte a la central a la brevedad.`;
    } else if (tipoAlerta === 'proximo') {
        mensaje += `🔔 *AVISO DE RENOVACIÓN DE DOCUMENTOS*\nLe informamos que se aproximan vencimientos en los próximos días para: *${detalle}*.\n\nPor favor, gestione los trámites correspondientes para evitar detener la operación de la unidad.`;
    } else {
        mensaje += `✅ *REVISIÓN DE CONTROL ELECTRÓNICO*\nSus documentos (SOAT, Póliza y RTM) se encuentran al día en nuestra base de datos.\n\n¡Gracias por mantener su unidad en regla! Buen viaje.`;
    }

    const telefonoLimpio = grua.telefono.replace(/\D/g, '');
    const urlWhatsapp = `https://api.whatsapp.com/send?phone=${telefonoLimpio}&text=${encodeURIComponent(mensaje)}`;
    window.open(urlWhatsapp, '_blank');
}

window.redireccionarAEdicion = function(id) {
    cargarEdicionGrua(id); 
    cambiarVista('vista-registro'); 
};

function conmutarVisibilidad(id) {
    const grua = gruas.find(g => g.id === id);
    if (!grua) return;
    const gruaDocRef = doc(db, "gruas", id);
    updateDoc(gruaDocRef, { visible: !(grua.visible !== false) });
}

function cargarEdicionGrua(id) {
    const grua = gruas.find(g => g.id === id);
    if (!grua) return;

    txtIdEdicion.value = grua.id;
    txtPlaca.value = grua.placa;
    txtAlias.value = grua.alias;
    selectEstado.value = grua.estado;
    selectPosicion.value = grua.posicion;
    dateSoat.value = grua.soat || '';
    datePoliza.value = grua.poliza || '';
    dateRtm.value = grua.rtm || '';
    txtTelefono.value = grua.telefono || '';
    txtObservaciones.value = grua.observaciones || '';

    tituloFormulario.textContent = "Modificar Parámetros de Grúa";
    btnGuardar.textContent = "ACTUALIZAR DATOS";
    btnCancelar.style.display = "inline-block";
    formGrua.scrollIntoView({ behavior: 'smooth' });
}

// Vinculación al entorno global requerida para llamadas cruzadas
window.cargarEdicionGrua = cargarEdicionGrua;

function eliminarGrua(id) {
    if (confirm('¿Confirma que desea eliminar esta grúa del sistema?')) {
        const gruaDocRef = doc(db, "gruas", id);
        deleteDoc(gruaDocRef)
            .then(() => alert('Grúa eliminada de la base de datos.'))
            .catch(err => console.error("Error eliminando: ", err));
    }
}

// ==========================================================================
// PROCESAMIENTO DEL FORMULARIO (AÑADIR / ACTUALIZAR EN FIRESTORE)
// ==========================================================================
formGrua.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idEdicion = txtIdEdicion.value;
    const gruaExistente = gruas.find(g => g.id === idEdicion);

    const tempGrua = {
        soat: dateSoat.value,
        poliza: datePoliza.value,
        rtm: dateRtm.value,
        estado: selectEstado.value
    };

    const { tipoAlerta, detalle } = evaluarAlertasGrua(tempGrua);

    if (tipoAlerta === 'vencido' && selectEstado.value !== 'inactivo') {
        alert(`⚠️ NOTIFICACIÓN: No es posible registrar/actualizar la grúa en estado activo. La unidad posee documentos vencidos (${detalle}). Se guardará automáticamente como INACTIVO.`);
        selectEstado.value = 'inactivo';
        selectPosicion.value = '';
    }

    const datosGrua = {
        placa: txtPlaca.value.trim().toUpperCase(),
        alias: txtAlias.value.trim(),
        estado: selectEstado.value,
        posicion: selectEstado.value === 'inactivo' ? '' : selectPosicion.value,
        soat: dateSoat.value,
        poliza: datePoliza.value,
        rtm: dateRtm.value,
        telefono: txtTelefono.value.trim(),
        observaciones: selectEstado.value === 'inactivo' && idEdicion ? '' : txtObservaciones.value.trim(),
        visible: gruaExistente ? (gruaExistente.visible !== false) : true
    };

    const placaDuplicada = gruas.some(g => g.placa === datosGrua.placa && g.id !== idEdicion);
    if (placaDuplicada) {
        alert('Error: Ya existe otra grúa registrada con la placa ' + datosGrua.placa);
        return;
    }

    try {
        if (idEdicion) {
            const gruaDocRef = doc(db, "gruas", idEdicion);
            await updateDoc(gruaDocRef, datosGrua);
        } else {
            await addDoc(gruasCollectionRef, datosGrua);
        }
        
        limpiarFormularioAdministrativo();
        alert('Datos Registrados o Actualizados Correctamente.');
    } catch (error) {
        console.error("Error al guardar en Firestore: ", error);
        alert('Ocurrió un error al sincronizar con la base de datos.');
    }
});

btnCancelar.addEventListener('click', limpiarFormularioAdministrativo);

function limpiarFormularioAdministrativo() {
    formGrua.reset();
    txtIdEdicion.value = '';
    tituloFormulario.textContent = "Registrar Nueva Grúa";
    btnGuardar.textContent = "GUARDAR GRÚA";
    btnCancelar.style.display = "none";
}

// ==========================================================================
// BUSCADORES Y PAGINACIÓN
// ==========================================================================
txtBuscar.addEventListener('input', () => {
    paginaActual = 1;
    renderizarTablaAdministrativa();
});

btnPrev.addEventListener('click', () => {
    if (paginaActual > 1) {
        paginaActual--;
        renderizarTablaAdministrativa();
    }
});

btnNext.addEventListener('click', () => {
    paginaActual++;
    renderizarTablaAdministrativa();
});

document.addEventListener('DOMContentLoaded', () => {
    // La sincronización inicial es controlada automáticamente por onSnapshot
});
