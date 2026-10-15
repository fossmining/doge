# Dogecoin Umbrel App Store

Community app store for umbrelOS with one app: **Dogecoin Core 1.14.9 + watch-only Trezor wallet** (`doge-dogecoin-core`, app version 1.19.2).

## What the app does

- `fetch` (one-shot) downloads the official `dogecoin-1.14.9-<arch>-linux-gnu.tar.gz`
  from github.com/dogecoin/dogecoin and installs it only if the SHA-256 matches the
  value pinned from the PGP-signed `SHA256SUMS.asc`. Supports `x86_64` and `aarch64`.
- `dogecoind` runs the official binary from `data/bin`, with chain data in `data/dogecoin`.
- `web` serves a status dashboard (sync, peers, mempool, RPC/ZMQ connection details)
  on the Umbrel app port **22580**, plus two home-screen widgets, and the **Wallet** page
  (`/wallet`) described below.

## Wallet page (watch-only, Trezor signing)

The wallet page turns the node into a watch-only wallet for one Trezor Dogecoin account.
Design goal: the Umbrel never holds a private key, and no third party learns your addresses.

| Step | Where it happens | What leaves your Umbrel |
|---|---|---|
| Link account | Trezor Suite → account → ⋯ → *Show public key (XPUB)*; paste `dgub…`/`xpub…` into **Setup** | nothing |
| Watch balances/history | node imports the first 20 receive + 20 change addresses as **watch-only** (`importmulti`, gap limit maintained automatically) | nothing |
| Receive | next unused address shown, with **Show & verify on Trezor** (device displays it) | nothing |
| Send | node selects coins, builds the unsigned tx and the referenced previous txs; **Trezor Connect** (loaded from connect.trezor.io only when you click) has the device sign it; node broadcasts | the signing request to the Trezor (via Suite's Bridge or WebUSB). Trezor's Blockbook is *not* consulted because refTxs come from the node |
| Air-gapped alternative | download unsigned JSON, sign elsewhere, paste signed hex in **Broadcast** (decoded and shown before sending) | nothing |

### MyDoge extension (optional third signing source)

For the self-custodial [MyDoge](https://www.mydoge.com) browser extension (Chrome/Chromium). *Wallet → MyDoge →
Connect*: the extension's `connect()` shares its address and public key; the node checks the key hashes to the
address, imports the address watch-only (`importmulti` with a rescan from 2023-01-01 or the date you give) and
tracks balance/history itself. Sending: *Spend from: MyDoge*, same review flow, then `requestPsbt({signOnly})`
signs inside the extension popup, the page re-decodes the result, and the node broadcasts. MyDoge's servers
are not used for balances or broadcasting. Change goes back to the same address (MyDoge is single-address).

### Node wallet mode (optional second signing source)

For people without a Trezor. Keys live in the node's own `wallet.dat`, which **must be encrypted**
first (Wallet → Node wallet → Encrypt; dogecoind restarts once). Then:

- Send: pick *Spend from: Node wallet*. Same build → review → sign → decode-check → broadcast flow;
  the passphrase is entered per send, the wallet is unlocked for ~20 s, `signrawtransaction` runs,
  and the wallet is locked again in a `finally`. The passphrase is never stored.
- Receive: a labelled node address, reused until it has received something.
- Backup: *Create & download backup* runs `backupwallet` into `data/dogecoin/backups/` and
  serves the (encrypted) file for download. No passphrase, no coins.
- The page warns if the node wallet holds spendable coins while the mode is *not* enabled.

This is a hot wallet secured by your passphrase and your Umbrel; keep savings on the Trezor side.

Hardening in `dashboard.py`: strict `Content-Security-Policy` (only own files + connect.trezor.io),
no inline scripts, `X-Frame-Options: DENY`, every POST requires a custom header and a same-origin
`Sec-Fetch-Site`/`Origin`, private extended keys (`xprv`/`dgpv`) are refused on sight, and the UI
warns if the node's own wallet ever holds spendable coins. The page is only reachable through
Umbrel's login. Before signing, the page checks the connected device's account xpub matches the
linked one (catches wrong device / wrong passphrase).

The only wallet state on disk is `data/walletui/account.json` (public key + derived addresses).
Dogecoin Core 1.14 cannot un-import watch-only addresses, so *Forget account* only removes that file.

Trezor Connect needs either Trezor Suite running (its bundled Bridge) or a Chromium browser
(WebUSB). Firefox needs Suite/Bridge. Dogecoin uses legacy P2PKH, path `m/44'/3'/account'`.

### Size

The wallet adds about **58 KB** of Python/HTML/JS (whole UI incl. dashboard: ~75 KB; whole app
folder: ~110 KB) and no extra containers or images. The download for a new node is still the
Dogecoin blockchain itself.

| | |
|---|---|
| P2P (published on the host) | `22556/tcp` |
| RPC (Umbrel Docker network only) | `doge-dogecoin-core_dogecoind_1:22555` |
| ZMQ | `28332` hashblock, `28333` rawblock, `28334` rawtx |
| RPC user / password | `umbrel` / derived per install, shown in the dashboard |

All containers use `python:3.12.11-slim-bookworm` pinned by multi-arch digest, so no
third-party Dogecoin image is trusted.

## Tor

A `tor` container (Umbrel's image) runs alongside the node and `dogecoind` starts with
`-proxy=<tor>:9050`, so every outbound peer connection and every transaction broadcast leaves
through Tor; peers see a Tor exit, not your IP. `torrc.template` also defines an RPC hidden service
for remote wallets/explorers (shown on the dashboard under *Privacy (Tor)*).

Not possible on Dogecoin Core 1.14: an inbound `.onion` listener or a Tor-only mode. 1.14 only
understands v2 onion addresses, which Tor no longer issues, so a v3 onion can't be advertised
(`-externalip` fails at start-up) and other 1.14 nodes couldn't dial it. Inbound stays on clearnet
`22556`. Because Tor needs an IP as hidden-service target, `dogecoind` has the fixed address
`10.21.21.231` and the Tor container `10.21.21.232` on the Umbrel network.

## Install

**Via this community store:** push this folder to a public Git repo, then in umbrelOS open
App Store → ⋯ → Community App Stores, paste the repo URL, and install *Dogecoin Core*.

**Sideload over SSH** (no Git hosting needed):

```sh
# from this folder on your computer
scp -r doge-dogecoin-core umbrel@umbrel.local:/tmp/
ssh umbrel@umbrel.local
STORE=$(ls -d ~/umbrel/app-stores/getumbrel-umbrel-apps-github-* | head -1)
rsync -a --delete --exclude=.gitkeep /tmp/doge-dogecoin-core/ "$STORE/doge-dogecoin-core/"
sudo umbreld client apps.install.mutate --appId doge-dogecoin-core
sudo umbreld client apps.state.query --appId doge-dogecoin-core
```

A sideloaded copy in the official store folder may disappear when Umbrel refreshes that
store; the installed app keeps running, but use the community store route for updates.
