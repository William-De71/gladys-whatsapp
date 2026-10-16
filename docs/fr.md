# WhatsApp

## Présentation

Discutez avec Gladys sur WhatsApp, via l'API officielle **WhatsApp Business Cloud** de Meta. Chaque utilisateur de Gladys lie son numéro WhatsApp ; ses messages arrivent à Gladys, qui lui répond sur WhatsApp et lui y envoie ses notifications. Les scènes peuvent réagir aux messages reçus (boutons de modèles, positions…) et envoyer des modèles de message approuvés.

L'intégration passe par le cloud de Meta (`graph.facebook.com`) : les textes échangés avec Gladys quittent votre réseau local. Recevoir des messages nécessite **Gladys Plus**, qui fournit à Meta une adresse HTTPS publique ; sans lui, Gladys peut seulement envoyer.

## Prérequis

- Gladys Assistant 5.1.0 ou plus récent.
- Une [application Meta](https://developers.facebook.com/apps) de type Entreprise, avec le produit **WhatsApp**, et un numéro professionnel. Le numéro de test fourni par Meta fonctionne aussi, mais n'atteint que les 5 numéros enregistrés dans WhatsApp → Configuration de l'API.
- Un **utilisateur système** (Paramètres de l'entreprise → Utilisateurs → Utilisateurs système) qui dispose de l'application et du compte WhatsApp, avec un jeton **sans expiration** et les autorisations `whatsapp_business_messaging` et `whatsapp_business_management`. Le jeton temporaire de la page de configuration de l'API expire au bout de 24 heures.
- Gladys Plus, pour recevoir les messages.
- Meta facture les messages d'une entreprise selon sa grille (notamment les modèles envoyés hors de la fenêtre de 24 heures).

## Configuration

| Champ                                   | Ce qu'il faut saisir                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Identifiant du numéro de téléphone      | L'identifiant affiché dans WhatsApp → Configuration de l'API (pas le numéro)                     |
| Jeton d'accès                           | Le jeton permanent de l'utilisateur système                                                      |
| Identifiant du compte WhatsApp Business | Facultatif : permet à l'intégration d'enregistrer son webhook chez Meta et de lister vos modèles |
| Jeton de vérification                   | Laissez vide : l'intégration le génère ; collez-le chez Meta                                     |
| Enregistrer le webhook                  | Activé par défaut : le webhook du compte suit l'URL Gladys Plus                                  |
| Modèle de secours                       | Nom d'un modèle approuvé avec une variable dans le corps, ex. `gladys_notification`              |
| Langue du modèle                        | Son code de langue, comme dans WhatsApp Manager : `en_US`, `fr`, `de`, `es`…                     |
| Marquer les messages reçus comme lus    | Coches bleues pour l'expéditeur                                                                  |
| Langue des réponses                     | Langue des réponses envoyées avant qu'un numéro soit lié                                         |

**Recevoir les messages** : dans le bloc **Webhooks Gladys Plus**, enregistrez votre clé Open API (Gladys Plus → Paramètres → Open API). L'URL du webhook s'affiche alors. Dans l'application Meta, ouvrez WhatsApp → Configuration, collez cette URL comme **URL de rappel** et le jeton de vérification de l'intégration comme **Jeton de vérification**, puis abonnez-vous au champ **messages**. Si l'identifiant du compte WhatsApp Business est renseigné, l'intégration dirige aussi elle-même le webhook du compte vers cette URL, et recommence à chaque changement d'URL (le bouton **Enregistrer le webhook** le fait à la demande).

**La fenêtre de 24 heures** : WhatsApp ne laisse une entreprise envoyer du texte libre que dans les 24 heures qui suivent le dernier message de l'utilisateur. Créez un modèle dans WhatsApp Manager (catégorie Utilitaire, une variable dans le corps, par exemple `Gladys : {{1}}`), attendez son approbation et indiquez son nom : hors de la fenêtre, Gladys fait passer ses messages par lui. Sans lui, ces messages sont refusés par Meta.

## Utilisation

**Lier votre numéro** : dans l'écran de configuration, **Lier mon compte** → générez un code, puis envoyez ce code sur WhatsApp au numéro professionnel, dans les 15 minutes. Gladys répond que votre compte est lié. Écrivez ensuite à Gladys comme dans la discussion de Gladys.

Sans Gladys Plus, utilisez le bouton **Lier un numéro sans Gladys Plus** : saisissez votre numéro (format international) et le code. Gladys vous envoie alors ses notifications via le modèle de secours ; vos messages n'atteignent pas Gladys.

Les messages texte, les boutons touchés et les légendes vont à Gladys. Les notes vocales, stickers et autres médias reçoivent la réponse « Gladys ne lit que les messages texte pour le moment ». Les messages des numéros non liés sont ignorés, sans réponse.

**Widget de tableau de bord** : le widget **WhatsApp** affiche le nom vérifié du numéro, sa note de qualité et sa limite d'envoi, les messages envoyés, reçus et en échec depuis minuit (UTC), le statut du numéro chez Meta, l'état de la réception, le dernier événement de Meta et le nombre de contacts liés.

![Le widget WhatsApp (illustration générée, pas une capture d'écran)](https://raw.githubusercontent.com/William-De71/gladys-whatsapp/main/docs/assets/widgets.fr.png)

**Scènes** :

- Déclencheur **Message WhatsApp reçu** : filtres sur le type de message, la charge utile d'un bouton, un texte exact. Variables : `from`, `contact_name`, `user`, `message_type`, `text`, `payload`, `latitude`, `longitude`, `emoji`, `message_id`.
- Déclencheur **Message WhatsApp non remis** : le premier échec pour un numéro, puis seulement après qu'un message est passé (une scène qui vous prévient sur WhatsApp ne peut pas boucler). Variables : `to`, `reason`, `error_code`, `error_title`, `message_id`.
- Action **Envoyer un modèle WhatsApp** : destinataire (vide : tous les contacts liés), nom du modèle, langue, paramètres du corps séparés par `|` (ou `nom=valeur` pour les paramètres nommés). Les variables de scène fonctionnent dans chaque champ.

Exemples : quand le bouton de modèle de charge utile `OPEN_GATE` est touché → ouvrir le portail ; quand l'alarme se déclenche → envoyer le modèle `alerte_alarme` à tout le monde ; quand un message n'est pas remis à cause du jeton → envoyer un e-mail.

## Dépannage

- **Tester la connexion** affiche le nom, la qualité et le statut du numéro, et si la réception fonctionne.
- **« Meta a refusé le jeton d'accès »** : le jeton a expiré (jeton temporaire) ou a été révoqué. Générez un jeton permanent pour l'utilisateur système.
- **Rien n'arrive dans Gladys** : vérifiez que Gladys Plus est lié, que la clé Open API est enregistrée, que l'URL et le jeton de vérification sont collés chez Meta et que le champ **messages** est abonné. Le widget affiche « en attente de Meta » jusqu'au premier événement.
- **Message non remis, hors fenêtre (131047)** : configurez un modèle de secours approuvé.
- **Numéro non autorisé (131030)** : avec le numéro de test de Meta, ajoutez le destinataire dans WhatsApp → Configuration de l'API.
- **Modèle refusé (132000, 132001)** : vérifiez le nom, le code de langue et le nombre de paramètres.
- Appuyez sur **Diagnostic** et copiez les lignes commençant par « WhatsApp diagnostic » de l'onglet Journaux dans une [issue GitHub](https://github.com/William-De71/gladys-whatsapp/issues) : le jeton, la clé Open API et les numéros en sont retirés ou masqués.
