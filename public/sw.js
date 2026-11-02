self.addEventListener("push", (event) => {
  let titre = "ETIK Paie";
  let corps = "";
  let lien = "/notifications";
  try {
    const data = event.data ? event.data.json() : {};
    if (data.titre) titre = data.titre;
    if (data.corps) corps = data.corps;
    if (data.lien) lien = data.lien;
  } catch {
    /* corps vide */
  }
  event.waitUntil(
    self.registration.showNotification(titre, {
      body: corps,
      data: { lien },
      icon: "/logo-etik-paie.png",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const lien = event.notification.data?.lien || "/notifications";
  const url = new URL(lien, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
      for (const fenetre of fenetres) {
        if (fenetre.url.startsWith(self.location.origin) && "focus" in fenetre) {
          fenetre.navigate(url);
          return fenetre.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
