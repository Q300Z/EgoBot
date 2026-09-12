# 10. Authentification & Chiffrement Blowfish V2

L'API AGELID implémente un système d'authentification double flux prenant en charge les requêtes standards (V1) et le protocole chiffré symétrique sécurisé (V2) ([`src/modules/auth/`](file:///home/tboutin/Documents/AGELID/api/src/modules/auth/), [`src/utils/crypto.ts`](file:///home/tboutin/Documents/AGELID/api/src/utils/crypto.ts)).

---

## 🔐 Comparatif des Flux d'Authentification

```mermaid
flowchart TD
    subgraph Flux_V1 ["Authentification V1 (JSON Clair)"]
        Req1[POST /api/v1/auth/login<br>Payload JSON clair] --> AuthSrv1[AuthService.loginV1]
        AuthSrv1 --> SaveRedis1[Stockage config Egobot dans Redis<br>TTL 1h]
        AuthSrv1 --> GenJWT1[Signature Token JWT HS256<br>jose 1h]
    end

    subgraph Flux_V2 ["Authentification V2 (Chiffrement Blowfish)"]
        Req2[POST /api/v2/auth/login<br>Payload chiffré Blowfish Base64] --> Decrypt[Déchiffrement Blowfish ECB PKCS5<br>egoroof-blowfish]
        Decrypt --> ParsePipe[Parsing clé=valeur avec séparateur pipe |]
        ParsePipe --> SaveRedis2[Stockage config Egobot dans Redis<br>TTL 1h]
        SaveRedis2 --> GenJWT2[Signature Token JWT HS256<br>jose 1h]
    end
```

---

## 🗝️ L'Algorithme de Chiffrement Blowfish V2 (`src/utils/crypto.ts`)

Pour communiquer avec les clients applicatifs Egobot existants, la V2 utilise le chiffrement par bloc **Blowfish** :

- **Mode** : `ECB` (_Electronic Codebook_).
- **Padding** : `PKCS5` (compatible blocs de 8 octets).
- **Clé secrète** : `IA@gelid2026`
- **Encodage transport** : Base64 URL-safe (remplacement de `+` par `-` et `/` par `_`).

### Structure du Payload Déchiffré :

Le texte déchiffré est une chaîne au format clé=valeur séparée par des barres verticales (`|`) :

```
email=user@agelid.com|user=usr_123|client=cli_456|db_key=Egobot_db_key|dev=false
```

### Méthodes Utilitaires Disponibles :

```typescript
import { encodeBlowfish, decodeBlowfish } from "../utils/crypto";

// Déchiffrement d'une chaîne reçue du client
const clearText = decodeBlowfish("IA@gelid2026", "", encryptedBase64);

// Chiffrement d'une réponse ou pour les tests
const cipherText = encodeBlowfish("IA@gelid2026", "", clearText);
```

---

## 🎫 Signature et Vérification JWT (`jose`)

Le framework utilise la bibliothèque moderne sans dépendance **`jose`** (remplaçant `jsonwebtoken`) :

### 1. Structure du Token JWT

- **Algorithme** : `HS256`
- **Durée de validité** : 1 heure (`1h`)
- **Claims embarqués** :
  ```json
  {
  	"id": "usr_123",
  	"email": "user@agelid.com",
  	"client_id": "cli_456",
  	"role": "USER",
  	"dev": "false"
  }
  ```

### 2. Validation par Middleware (`auth.middleware.ts`)

Le middleware `authenticateJWT` extrait le token soit :

- Depuis le header HTTP : `Authorization: Bearer <token>`
- Depuis la query string pour les flux SSE : `GET /sse/v1/jobs/123?token=<token>`

```typescript
import { jwtVerify } from "jose";

const secret = new TextEncoder().encode(env.SECRET_KEY);
const { payload } = await jwtVerify(token, secret);
req.user = payload as UserPayload;
```

---

## 💾 Persistance des Sessions Egobot dans Redis

Lors de chaque authentification réussie, la configuration de base de données Egobot (`db_key`, `url`, `email`) est mise en cache dans Redis sous la clé `Egobot:{userId}` avec un TTL strict de **3 600 secondes (1 heure)**.

Lorsqu'un message est posté, le `MessageService` récupère instantanément cette configuration depuis Redis pour l'attacher au job d'inférence sans réinterroger la base SQL.
