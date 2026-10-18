// Conector inicial V12.0
// No guarda nada si todavía no existe supabase-config.js configurado.

window.DB = {
  cliente: null,

  iniciar() {
    if (!window.supabase) {
      console.warn('Supabase JS no cargó.');
      return false;
    }
    if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY ||
        window.SUPABASE_URL.includes('TU-PROYECTO')) {
      console.warn('Supabase todavía no está configurado.');
      return false;
    }
    this.cliente = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    return true;
  },

  conectado() {
    return !!this.cliente;
  },

  async obtenerPartidosFinalizados(torneoId, divisionId) {
    if (!this.cliente) throw new Error('Base de datos no configurada.');
    let q=this.cliente.from('partidos').select('id,estado,equipo_a_inscripcion_id,equipo_b_inscripcion_id,resultados_partidos(*)').eq('estado','FINALIZADO');
    if(torneoId) q=q.eq('torneo_id',torneoId); if(divisionId) q=q.eq('division_id',divisionId);
    const {data,error}=await q; if(error) throw error; return data||[];
  },

  async guardarResultado(resultado) {
    if (!this.cliente) throw new Error('Base de datos no configurada.');
    const { data, error } = await this.cliente
      .from('resultados_partidos')
      .upsert(resultado, { onConflict: 'partido_id' })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
};
