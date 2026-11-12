# The demo board

"Try the demo board" (landing page and `/login`) signs a visitor into a throwaway account holding a copy of a template board, so they can see capture results, AI analysis and clusters without installing anything or giving an email.

## How it works

- `POST /demo` ([route](../apps/web/src/app/demo/route.ts)) creates a user `demo-<uuid>@demo.justcreate.invalid`, copies the template account's rows and files into it ([demo-clone.ts](../apps/web/src/lib/demo-clone.ts)), and signs the visitor in. POST only, and limited to 5 per IP per 10 minutes.
- The **template** is a normal account (`demo-template@demo.justcreate.invalid`). Its id is `DEMO_TEMPLATE_USER_ID` (web env, Vercel too). Change the template by changing that account, or point the variable at another one. Without the variable the button shows "isn't available".
- Demo accounts can look around, move cards, edit notes and labels, and start 2 AI generations. They cannot upload or save captures, or create API tokens ([demo.ts](../apps/web/src/lib/demo.ts)).
- A demo copy is deleted after 24 hours (files too): each new demo removes up to 20 expired ones. At most 300 demo boards exist at once.

## Rebuilding the template

1. Create the account and save images to it through the API (an extension token or a session), with the worker running.
2. Wait until every `analyze` job and the `cluster` job are done.
3. Rename its board to something other than "Demo board" (copies are named that way; cleanup deletes boards with that name).
4. Set `DEMO_TEMPLATE_USER_ID` to its user id.

## Photo credits (Wikimedia Commons)

| Image | Author | Licence |
|---|---|---|
| Hopetoun Falls | Diliff | CC BY-SA 3.0 |
| Lombard Street, San Francisco | Bernard Gagnon | CC BY-SA 3.0 |
| Colosseum, Rome | Diliff | CC BY-SA 2.5 |
| Monarch butterfly on milkweed | Derek Ramsey | GFDL 1.2 |
| Sunset in Santorini | Maria Kontaxopoulou | CC BY-SA 4.0 |
| Pottery wares at Sidi Bousaid | Emna Mizouni | CC BY-SA 4.0 |
| Mustermesse Ljubljana (poster) | Ivan Vavpotič | Public domain |
| Wooden blocks on a concrete shelf | RukshanV | CC BY-SA 4.0 |
| Autumn forest path | Vovogov90 | CC0 |
| Dotonbori, Osaka, at night | Martin Falbisoner | CC BY-SA 4.0 |
| White flowers | Alvesgaspar | CC BY-SA 3.0 |
| Cabinet design plate | Internet Archive Book Images | No known copyright restrictions |
