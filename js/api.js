window.API = (() => {

  async function request(action, payload = {}) {

    if (!APP_CONFIG.API_URL) {
      throw new Error("API_URL não configurada.");
    }

    const session = await AppDB.get("session", "current");

    const finalPayload = {
      ...payload,
      token: session?.session?.token || null
    };

    const response = await fetch(APP_CONFIG.API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action,
        payload: finalPayload
      })
    });

    if (!response.ok) {
      throw new Error(`Erro HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || "Erro na API");
    }

    return data;
  }

  return {
    request
  };

})();
