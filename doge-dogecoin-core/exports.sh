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

# RPC hidden service (created by the tor container on first start), for
# remote wallets/explorers over Tor. There is deliberately no P2P hidden
# service: Dogecoin Core 1.14 only understands v2 .onion addresses, which Tor
# no longer creates, so a v3 onion can neither be advertised (-externalip
# fails) nor dialled by other 1.14 nodes.
rpc_hidden_service_file="${EXPORTS_TOR_DATA_DIR}/app-${EXPORTS_APP_ID}-rpc/hostname"
export APP_DOGECOIN_RPC_HIDDEN_SERVICE="$(cat "${rpc_hidden_service_file}" 2>/dev/null || echo "notyetset.onion")"

# All outbound peer connections and transaction broadcasts go through Tor;
# inbound stays on the clearnet port (Umbrel's Bitcoin app pattern, minus
# the onion listener 1.14 cannot have).
export APP_DOGECOIN_TOR_MODE="tor-outbound"
export APP_DOGECOIN_TOR_ARGS="-proxy=${APP_DOGECOIN_TOR_PROXY_IP}:9050 -listenonion=0"
