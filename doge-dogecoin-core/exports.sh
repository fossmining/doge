# Static addresses on the Umbrel network: Tor needs an IP (not a hostname)
# as the hidden-service target.
export APP_DOGECOIN_NODE_IP="10.21.21.231"
export APP_DOGECOIN_TOR_PROXY_IP="10.21.21.232"
export APP_DOGECOIN_DATA_DIR="${EXPORTS_APP_DATA_DIR}/dogecoin"

export APP_DOGECOIN_P2P_PORT="22556"
export APP_DOGECOIN_RPC_PORT="22555"
export APP_DOGECOIN_ZMQ_HASHBLOCK_PORT="28332"
export APP_DOGECOIN_ZMQ_RAWBLOCK_PORT="28333"
export APP_DOGECOIN_ZMQ_RAWTX_PORT="28334"

export APP_DOGECOIN_NETWORK="mainnet"
export APP_DOGECOIN_RPC_USER="umbrel"
export APP_DOGECOIN_RPC_PASS="$(derive_entropy "${app_entropy_identifier}-rpc-password")"

# Hidden services (created by the tor container on first start)
p2p_hidden_service_file="${EXPORTS_TOR_DATA_DIR}/app-${EXPORTS_APP_ID}-p2p/hostname"
rpc_hidden_service_file="${EXPORTS_TOR_DATA_DIR}/app-${EXPORTS_APP_ID}-rpc/hostname"
export APP_DOGECOIN_P2P_HIDDEN_SERVICE="$(cat "${p2p_hidden_service_file}" 2>/dev/null || echo "notyetset.onion")"
export APP_DOGECOIN_RPC_HIDDEN_SERVICE="$(cat "${rpc_hidden_service_file}" 2>/dev/null || echo "notyetset.onion")"

# Peer privacy mode. "tor" (default): all outbound connections go through
# Tor and the node is reachable over its .onion and on the clearnet port.
# "tor-only": additionally -onlynet=onion, so only .onion peers are used
# (fewer peers, no clearnet exposure). Switched from the dashboard; takes
# effect on app restart.
DOGE_TOR_MODE="tor"
DOGE_TOR_FILE="${EXPORTS_APP_DATA_DIR}/walletui/tor.json"
if [[ -f "${DOGE_TOR_FILE}" ]] && grep -q '"onlynet_onion": *true' "${DOGE_TOR_FILE}" 2>/dev/null; then
	DOGE_TOR_MODE="tor-only"
fi
export APP_DOGECOIN_TOR_MODE="${DOGE_TOR_MODE}"
DOGE_TOR_ARGS="-proxy=${APP_DOGECOIN_TOR_PROXY_IP}:9050 -onion=${APP_DOGECOIN_TOR_PROXY_IP}:9050 -listenonion=0 -discover=0"
if [[ "${APP_DOGECOIN_P2P_HIDDEN_SERVICE}" != "notyetset.onion" ]]; then
	DOGE_TOR_ARGS="${DOGE_TOR_ARGS} -externalip=${APP_DOGECOIN_P2P_HIDDEN_SERVICE}"
fi
if [[ "${DOGE_TOR_MODE}" == "tor-only" ]]; then
	DOGE_TOR_ARGS="${DOGE_TOR_ARGS} -onlynet=onion"
fi
export APP_DOGECOIN_TOR_ARGS="${DOGE_TOR_ARGS}"
