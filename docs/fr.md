# Mill

Les radiateurs, prises et capteurs d'air Mill dans Gladys, par le cloud Mill
(le compte de l'appli Mill) et, pour les radiateurs Gen 3 récents, par leur API
locale sur votre réseau.

> **Développée sans le matériel : vos retours sont les bienvenus.**
> L'intégration a été écrite d'après les bibliothèques open source de
> l'intégration Home Assistant, sans compte Mill ni radiateur Mill. Si quelque
> chose semble faux, ouvrez un ticket sur
> [GitHub](https://github.com/guim31/gladys-mill/issues).
>
> Cette intégration n'est pas affiliée à Mill International AS.

## Ce qu'elle fait

- Trouve tous les radiateurs, prises, capteurs Mill Sense et purificateurs
  d'air de votre compte Mill, et les radiateurs Gen 3 que vous listez sur le
  réseau local.
- Affiche la température mesurée, la consigne, le mode, si le radiateur
  chauffe, la puissance consommée et l'énergie du jour.
- Permet de changer la consigne et le mode (arrêt, consigne individuelle,
  programme hebdomadaire) depuis le tableau de bord et les scènes.
- Tient un index d'énergie pour le suivi d'énergie de Gladys.
- Déclenche une scène quand un appareil Mill ne répond plus.
- Propose un widget de tableau de bord avec tous les radiateurs d'un coup d'œil.

## Prérequis

- Gladys 5.1.0 ou plus récent.
- Pour le cloud : l'adresse e-mail et le mot de passe de l'appli Mill (cloud
  Mill Norway, l'appli des appareils Gen 2 et Gen 3).
- Pour le mode local : un radiateur Mill Gen 3 dont l'API locale est activée
  dans l'appli Mill, avec une adresse IP fixe (une réservation DHCP dans votre
  box).

Les deux peuvent servir ensemble : le cloud pour les prises et les capteurs,
l'API locale pour les radiateurs Gen 3.

## Configuration

1. Dans Gladys, ouvrez **Intégrations → Mill** et remplissez le formulaire :
   - **Adresse e-mail** et **Mot de passe** : votre compte Mill. Laissez-les
     vides pour n'utiliser que des radiateurs locaux.
   - **Adresses locales** : les adresses IP de vos radiateurs Gen 3, séparées
     par des virgules, par exemple `192.168.1.40, 192.168.1.41`.
   - **Rafraîchissement du cloud** : toutes les minutes (par défaut), toutes
     les 2 ou 5 minutes.
   - **Langue des noms de fonctionnalités** : les noms donnés aux
     fonctionnalités quand un appareil est ajouté (français par défaut).
   - **Préférer la connexion locale** (affiché par Gladys) : quand un radiateur
     Gen 3 est à la fois dans votre compte et sur le réseau local, seule sa
     copie locale est proposée dans l'onglet Découverte.
2. Cliquez sur **Tester la connexion** : le résultat liste les appareils du
   cloud et chaque radiateur local.
3. Ouvrez l'onglet **Découverte** et ajoutez les appareils voulus.

Le mot de passe est conservé par Gladys dans la configuration de
l'intégration. L'intégration garde les jetons de session Mill dans son volume
`/data`, pour ne pas se reconnecter à chaque redémarrage.

## Appareils

**Radiateur et prise** (cloud) — un appareil par appareil Mill :

| Fonctionnalité           | Ce qu'elle montre                                                      |
| ------------------------ | ---------------------------------------------------------------------- |
| Température              | La température mesurée par le radiateur                                |
| Consigne                 | La température visée, de 5 à 35 °C, par pas de 0,5 °C                  |
| Mode                     | Arrêt, consigne individuelle, programme hebdomadaire                   |
| Chauffe                  | Si le radiateur chauffe en ce moment                                   |
| Puissance                | La puissance consommée, en W                                           |
| Énergie aujourd'hui      | L'énergie du jour, en kWh (remise à 0 chaque nuit)                     |
| Index énergie            | Un compteur qui ne fait que croître, pour le suivi d'énergie           |
| Humidité                 | Prises équipées d'un capteur                                           |
| Sécurité enfant          | Lecture seule                                                          |
| Fenêtre ouverte détectée | Le radiateur a détecté une chute brutale de température (1 = détectée) |
| Hors-gel                 | Lecture seule, quand le radiateur l'indique                            |

Changer la consigne passe le radiateur en consigne individuelle, comme le fait
l'appli Mill : en programme hebdomadaire, le radiateur suit son programme, pas
la consigne.

**Radiateur Gen 3** (local) — température, consigne, mode, chauffe,
puissance et, quand le radiateur les envoie, humidité, sécurité enfant et
fenêtre ouverte.

**Mill Sense** (cloud) — température, humidité, CO2 estimé, COV totaux,
batterie.

**Purificateur d'air** (cloud) — température, humidité, PM2.5 et PM10 quand le
purificateur les indique (lecture seule).

## Widget de tableau de bord

**Radiateurs Mill** montre tous les radiateurs ajoutés à Gladys : température
mesurée, consigne et état (en chauffe, au repos, arrêt, hors ligne), la
puissance totale et le nombre de radiateurs en chauffe. Deux boutons agissent
sur tous : **Tous : programme** (retour au programme hebdomadaire) et **Tout
éteindre** (demande une confirmation). La consigne de chaque radiateur reste
sur les widgets thermostat de Gladys.

## Déclencheur et action de scène

- Déclencheur **Appareil Mill hors ligne** : un appareil Mill ne répond plus —
  débranché, hors Wi-Fi ou disjoncteur coupé. Filtrez sur un appareil ou
  laissez le filtre vide ; la variable `device_name` contient le nom de
  l'appareil. Une panne du cloud Mill lui-même ne déclenche rien (les
  appareils s'affichent « injoignables »).
- Action **Passer tous les radiateurs Mill dans un mode** : programme
  hebdomadaire, consigne individuelle ou arrêt, pour tous les radiateurs et
  prises ajoutés à Gladys. Ses sorties `changed` et `failed` comptent les
  radiateurs modifiés et ceux qui n'ont pas répondu.

## Exemples de scènes

- **Départ de la maison** : quand la dernière personne part, lancez « Passer
  tous les radiateurs Mill dans un mode » avec **Arrêt** — ou avec **Programme
  hebdomadaire** si le programme baisse déjà la température.
- **Fenêtre ouverte** : quand un détecteur d'ouverture de la pièce s'ouvre,
  passez le mode du radiateur de la pièce à **Arrêt** ; quand il se ferme,
  revenez au **Programme hebdomadaire**.
- **Disjoncteur coupé** : quand « Appareil Mill hors ligne » se déclenche,
  envoyez un message « {{device_name}} ne répond plus ».

## Rafraîchissement et quotas

Gladys n'interroge pas encore les appareils externes de façon fiable :
l'intégration les rafraîchit elle-même :

- le cloud Mill toutes les minutes (ou 2, ou 5 minutes) : deux requêtes par
  maison ;
- chaque radiateur local toutes les 30 secondes.

Après la première recherche, seuls les appareils ajoutés à Gladys sont lus. Le
cloud Mill limite les requêtes : quand il répond « trop de requêtes » (HTTP
429), l'intégration divise son rythme par deux, jusqu'à une fois toutes les
30 minutes, tant qu'il ne répond pas. Un mot de passe refusé arrête les
lectures du cloud jusqu'à ce que vous changiez la configuration, pour que des
essais répétés ne bloquent pas le compte. Seules les valeurs qui changent
sont envoyées à Gladys, et une valeur inchangée de nouveau toutes les 6 heures.

## Dépannage

- **« Compte Mill refusé »** : vérifiez l'adresse e-mail et le mot de passe
  dans l'appli Mill, puis enregistrez de nouveau la configuration.
- **Un radiateur local ne répond pas** : vérifiez que l'API locale est activée
  dans l'appli Mill, que le radiateur garde la même adresse IP et que Gladys
  peut le joindre (l'intégration tourne dans un conteneur sur le serveur
  Gladys).
- **Pas de valeur sur une fonctionnalité** : l'appareil ne l'indique pas (la
  fonctionnalité reste alors vide), ou il est hors ligne.
- **Un radiateur du cloud s'affiche « injoignable »** : le cloud Mill ne répond
  pas, ou le radiateur est déconnecté du cloud.
- Les journaux de l'intégration ne montrent que son cycle de vie (démarrage,
  connexion, appareil perdu puis retrouvé, erreurs, vos actions). La variable
  d'environnement `LOG_LEVEL=debug` montre chaque rafraîchissement.

## Limites

- Développée sans appareil ni compte Mill : les noms des champs viennent des
  bibliothèques de Home Assistant, les vraies réponses peuvent différer. Vos
  retours sont les bienvenus.
- Pas de pilotage des purificateurs d'air (mode, vitesse) : lecture seule,
  l'API cloud des purificateurs n'est pas documentée.
- La sécurité enfant, le hors-gel et la détection de fenêtre ouverte sont
  affichés, pas modifiés.
- L'index d'énergie part de la première lecture, et ignore ce qu'un radiateur
  consomme pendant que l'intégration est arrêtée.
- Les anciens radiateurs Mill (Gen 1, première appli Mill) ne sont pas pris en
  charge.
- Le mode local exige une adresse IP fixe : Gladys tourne dans un conteneur qui
  ne peut pas découvrir les radiateurs sur le réseau.
