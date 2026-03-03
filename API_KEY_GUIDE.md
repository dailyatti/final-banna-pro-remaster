# 🔑 Google Gemini API Kulcs Beszerzési Útmutató

## Jelenleg Használt Modellek

Az alkalmazás a **legújabb** Google Gemini képgeneráló modelleket használja:

- **Pro Mód**: `gemini-3-pro-image-preview` 
  - 4K felbontás támogatás
  - Professzionális minőség
  - Komplex utasítások kezelése
  
- **Flash Mód**: `gemini-2.5-flash-image`
  - 1024px felbontás
  - Gyors generálás
  - Nagy mennyiségű feldolgozásra optimalizált

---

## 📋 Lépésről Lépésre: API Kulcs Beszerzése

### 1. lépés: Google AI Studio Hozzáférés

1. **Nyisd meg a Google AI Studio-t**:
   - Menj a [https://aistudio.google.com](https://aistudio.google.com) oldalra
   - Jelentkezz be Google fiókkal

2. **Hozz létre új projektet** (ha még nincs):
   - Kattints a "Create New Project" gombra
   - Adj neki egy nevet (pl. "Nano Banana Studio")

### 2. lépés: API Kulcs Generálása

1. **API Keys menüpont**:
   - A bal oldali menüben kattints az **"API Keys"** gombra
   - Vagy közvetlenül: [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)

2. **Új kulcs létrehozása**:
   - Kattints a **"Create API Key"** gombra
   - Válaszd ki a Google Cloud projektet (vagy hozz létre újat)
   - Az API kulcs azonnal generálódik

3. **Kulcs másolása**:
   - Kattints a **"Copy"** ikonra
   - **FONTOS**: Mentsd el biztonságos helyen, mert később nem láthatod újra!

---

## 💳 Fizetős Előfizetés Beállítása

### Miért van szükség fizetős előfizetésre?

Az ingyenes verzió korlátozott:
- **Napi 15 kérés** limittel
- **Alacsonyabb prioritás** a feldolgozásban
- **Nincs garantált elérhetőség**

A **fizetős verzió előnyei**:
- ✅ **Korlátlan kérések** (usage-alapú díjazás)
- ✅ **Magasabb rate limit** (több kérés percenként)
- ✅ **4K felbontás** elérése Pro modellel
- ✅ **Prioritás feldolgozás**
- ✅ **SLA garancia**

### Lépések a Fizetős Előfizetéshez

#### 1. Google Cloud Console Beállítása

1. **Menj a Google Cloud Console-ra**:
   - [https://console.cloud.google.com](https://console.cloud.google.com)
   - Jelentkezz be ugyanazzal a Google fiókkal

2. **Válaszd ki a projektet**:
   - Kattints a projekt kiválasztóra felül
   - Válaszd ki azt a projektet, amihez az API kulcsot generáltad

#### 2. Számlázás Engedélyezése

1. **Billing beállítása**:
   - A bal oldali menüben: **Billing** (Számlázás)
   - Ha nincs billing account, kattints **"Create Billing Account"**

2. **Fizetési információk megadása**:
   - Válassz **Billing Account Type**:
     - **Individual** (Egyéni) - Ha magánszemélyként használod
     - **Business** (Vállalati) - Ha céges használat
   
3. **Fizetési módszer hozzáadása**:
   - **Bankkártya** (Visa, Mastercard, American Express)
   - **PayPal** (bizonyos régiókban)
   - Add meg a kártyaadatokat:
     - Kártyaszám
     - Lejárati dátum
     - CVC kód
     - Számlázási cím

4. **Elfogadás és aktiválás**:
   - Fogadd el a Google Cloud Terms of Service-t
   - Kattints **"Start my free trial"** vagy **"Enable Billing"**

#### 3. Gemini API Engedélyezése

1. **API Library megnyitása**:
   - Menj a [APIs & Services > Library](https://console.cloud.google.com/apis/library)
   
2. **Gemini API keresése**:
   - Keresd meg: **"Gemini API"** vagy **"Generative Language API"**
   - Kattints rá

3. **API Engedélyezése**:
   - Kattints az **"Enable"** (Engedélyezés) gombra
   - Várd meg, amíg aktiválódik (1-2 perc)

#### 4. Kvóták és Limitek Beállítása (Opcionális)

1. **Kvóták megtekintése**:
   - Menj: **APIs & Services > Quotas**
   - Szűrj a "Gemini API"-ra

2. **Rate Limit növelése**:
   - Ha nagyobb kapacitásra van szükséged, kérhetsz quota növelést
   - Kattints az **"Edit Quotas"** gombra
   - Add meg az indoklást és a kért új limitet

---

## 💰 Árazás és Költségek (2024 November)

### Gemini Pro Image Model (`gemini-3-pro-image-preview`)

| Funkció | Ár |
|---------|-----|
| **Image Generation** | $0.10 / kép (4K felbontás) |
| **Image Editing** | $0.08 / szerkesztés |
| **Batch Processing** | $0.09 / kép (10+ kép esetén) |

### Gemini Flash Image Model (`gemini-2.5-flash-image`)

| Funkció | Ár |
|---------|-----|
| **Image Generation** | $0.04 / kép (1024px) |
| **Image Editing** | $0.03 / szerkesztés |
| **Batch Processing** | $0.035 / kép (10+ kép esetén) |

### Példa Költségszámítás

**Havi 100 kép generálás Pro modellel:**
- 100 kép × $0.10 = **$10 / hó**

**Havi 500 kép generálás Flash modellel:**
- 500 kép × $0.04 = **$20 / hó**

**FONTOS**: 
- Csak a ténylegesen generált képekért fizetsz
- Nincs havi fix költség
- Első **$300 kredit ingyen** új ügyfeleknek (90 napig érvényes)

---

## 🛡️ Költségkontroll és Biztonság

### Költségriasztások Beállítása

1. **Billing Alerts**:
   - Menj: **Billing > Budgets & Alerts**
   - Kattints **"Create Budget"**

2. **Budget létrehozása**:
   - **Budget Name**: "Gemini API Monthly Limit"
   - **Amount**: Pl. $50 / hó
   - **Alert Thresholds**: 50%, 90%, 100%
   - **Alert Email**: Add meg az email címed

3. **Mentés**:
   - Kattints **"Finish"**
   - Email értesítést kapsz, ha eléred a limiteket

### API Kulcs Biztonsága

⚠️ **SOHA ne oszd meg az API kulcsot!**
⚠️ **Ne commitáld GitHub-ra** (használj .env fájlt, ami a .gitignore-ban van)

**Kulcs védelme**:
1. **Környezeti változóban tárold** (`.env.local`)
2. **Netlify-ban**: Environment Variables-ben add meg
3. **Használj API Key Restrictions-t**:
   - Google Cloud Console > Credentials
   - Restrict Key > HTTP referrers
   - Add meg a domain-t (pl. `yourapp.netlify.app`)

---

## ✅ Ellenőrzés: Működik-e az API?

### Tesztelés a Nano Banana Studio-ban

1. **Nyisd meg az alkalmazást**:
   - [https://yourapp.netlify.app](https://yourapp.netlify.app)

2. **API Kulcs megadása**:
   - Kattints a **"Connect API Key"** gombra
   - Illeszd be a másolt API kulcsot
   - Kattints **"Save"**

3. **Első kép generálása**:
   - Tölts fel egy képet
   - Válassz aspect ratio-t (pl. 16:9 → 9:16)
   - Adj meg promptot (opcionális)
   - Kattints **"Render Image"**

4. **Sikeres, ha**:
   - A státusz "Processing"-ről "Success"-re vált
   - Látod az új képet a kívánt formátumban
   - Nincs hibaüzenet

---

## 🆘 Gyakori Problémák és Megoldásuk

### "API Key Invalid" Hiba

**Megoldás**:
1. Ellenőrizd, hogy helyesen másoltad-e a kulcsot
2. Google Cloud Console > APIs & Services > Credentials
3. Nézd meg, hogy az API kulcs aktív-e
4. Ellenőrizd, hogy a Gemini API engedélyezve van-e

### "Quota Exceeded" Hiba

**Megoldás**:
1. Ingyenes tier esetén: várd meg a napi limit resetelését (éjfél UTC)
2. Fizetős tier: ellenőrizd a billing account-ot
3. Növeld a quota-t: Cloud Console > Quotas

### "Billing Not Enabled" Hiba

**Megoldás**:
1. Engedélyezd a számlázást: Cloud Console > Billing
2. Adj hozzá fizetési módot
3. Várj 5-10 percet az aktiválásra

### "Model Not Found" Hiba

**Megoldás**:
1. Ellenőrizd, hogy az API kulcsod hozzáfér-e a preview modellekhez
2. Próbáld ki a Flash modelt először (alapértelmezett)
3. Ha továbbra sem működik, kapcsold be a Pro módot

---

## 📞 Támogatás és További Információk

### Hivatalos Dokumentáció
- **Gemini API Docs**: [https://ai.google.dev](https://ai.google.dev)
- **Pricing**: [https://ai.google.dev/pricing](https://ai.google.dev/pricing)
- **Cloud Console**: [https://console.cloud.google.com](https://console.cloud.google.com)

### Közösségi Támogatás
- **Google AI Studio Community**: [https://discuss.ai.google.dev](https://discuss.ai.google.dev)
- **Stack Overflow**: Tag: `google-gemini-api`

### Közvetlen Segítség
Ha problémád van, ellenőrizd:
1. ✅ API kulcs helyesen van megadva
2. ✅ Billing engedélyezve van
3. ✅ Gemini API aktív a projektben
4. ✅ Nincs napi/havi limit túllépés

---

## 🎉 Sikeres Beállítás!

Ha mindent követtél, most már:
- ✅ Van működő API kulcsod
- ✅ Fizetős előfizetés aktív
- ✅ Használhatod a legújabb Gemini modelleket
- ✅ 4K képeket generálhatsz Pro modellel
- ✅ Korlátlan képgenerálás (usage-alapú fizetéssel)

**Jó szórakozást a Nano Banana Studio Pro használatához!** 🍌✨
