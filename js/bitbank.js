'use strict';

//  ---------------------------------------------------------------------------

const Exchange = require ('./base/Exchange');
const { ExchangeError, AuthenticationError, InvalidNonce, InsufficientFunds, InvalidOrder, OrderNotFound, NotSupported } = require ('./base/errors');

//  ---------------------------------------------------------------------------

module.exports = class bitbank extends Exchange {
    describe () {
        return this.deepExtend (super.describe (), {
            'id': 'bitbank',
            'name': 'bitbank',
            'countries': 'JP',
            'has': {
                'fetchOHLCV': true,
                'fetchOpenOrders': true,
                'fetchMyTrades': true,
                // 'fetchDepositAddress': true,
                // 'withdraw': true,
            },
            'timeframes': {
                '1m': '1min',
                '5m': '5min',
                '15m': '15min',
                '30m': '30min',
                '1h': '1hour',
                '4h': '4hour',
                '8h': '8hour',
                '12h': '12hour',
                '1d': '1day',
                '1w': '1week',
            },
            'urls': {
                'logo': 'https://user-images.githubusercontent.com/1294454/37808081-b87f2d9c-2e59-11e8-894d-c1900b7584fe.jpg',
                'api': {
                    'public': 'https://public.bitbank.cc',
                    'private': 'https://api.bitbank.cc/v1',
                },
                'www': 'https://bitbank.cc/',
                'doc': 'https://docs.bitbank.cc/',
                'fees': 'https://bitbank.cc/docs/fees/',
            },
            'api': {
                'public': {
                    'get': [
                        '{pair}/ticker',
                        '{pair}/depth',
                        '{pair}/transactions',
                        '{pair}/transactions/{YYYYMMDD}',
                        '{pair}/candlestick/{candle-type}/{YYYYMMDD}',
                    ],
                },
                'private': {
                    'get': [
                        'user/assets',
                        'user/spot/order',
                        'user/spot/active_orders',
                        'user/spot/trade_history',
                        'user/withdrawal_account',
                    ],
                    'post': [
                        'user/spot/order',
                        'user/spot/cancel_order',
                        'user/spot/cancel_orders',
                        'user/spot/orders_info',
                        'user/request_withdrawal',
                    ],
                },
            },
            'markets': {
                'BCH/BTC': { 'id': 'bcc_btc', 'symbol': 'BCH/BTC', 'base': 'BCH', 'quote': 'BTC', 'baseId': 'BCC' },
                'BCH/JPY': { 'id': 'bcc_jpy', 'symbol': 'BCH/JPY', 'base': 'BCH', 'quote': 'JPY', 'baseId': 'BCC' },
                'MONA/BTC': { 'id': 'mona_btc', 'symbol': 'MONA/BTC', 'base': 'MONA', 'quote': 'BTC' },
                'MONA/JPY': { 'id': 'mona_jpy', 'symbol': 'MONA/JPY', 'base': 'MONA', 'quote': 'JPY' },
                'ETH/BTC': { 'id': 'eth_btc', 'symbol': 'ETH/BTC', 'base': 'ETH', 'quote': 'BTC' },
                'LTC/BTC': { 'id': 'ltc_btc', 'symbol': 'LTC/BTC', 'base': 'LTC', 'quote': 'BTC' },
                'XRP/JPY': { 'id': 'xrp_jpy', 'symbol': 'XRP/JPY', 'base': 'XRP', 'quote': 'JPY' },
                'BTC/JPY': { 'id': 'btc_jpy', 'symbol': 'BTC/JPY', 'base': 'BTC', 'quote': 'JPY' },
            },
            'fees': {
                'trading': {
                    // only temporarily
                    'maker': 0.0,
                    'taker': 0.0,
                },
                'funding': {
                    'withdraw': {
                        // 'JPY': amount => amount > 30000 ? 756 : 540,
                        'BTC': 0.001,
                        'LTC': 0.001,
                        'XRP': 0.15,
                        'ETH': 0.0005,
                        'MONA': 0.001,
                        'BCC': 0.001,
                    },
                },
            },
            'precision': {
                'price': 8,
                'amount': 8,
            },
        });
    }

    parseTicker (ticker, market = undefined) {
        let symbol = market['symbol'];
        let timestamp = ticker['timestamp'];
        let last = parseFloat (ticker['last']);
        return {
            'symbol': symbol,
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'high': parseFloat (ticker['high']),
            'low': parseFloat (ticker['low']),
            'bid': parseFloat (ticker['buy']),
            'bidVolume': undefined,
            'ask': parseFloat (ticker['sell']),
            'askVolume': undefined,
            'vwap': undefined,
            'open': undefined,
            'close': last,
            'last': last,
            'previousClose': undefined,
            'change': undefined,
            'percentage': undefined,
            'average': undefined,
            'baseVolume': parseFloat (ticker['vol']),
            'quoteVolume': undefined,
            'info': ticker,
        };
    }

    async fetchTicker (symbol, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let response = await this.publicGetPairTicker (this.extend ({
            'pair': market['id'],
        }, params));
        return this.parseTicker (response['data'], market);
    }

    async fetchOrderBook (symbol, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let response = await this.publicGetPairDepth (this.extend ({
            'pair': this.marketId (symbol),
        }, params));
        let orderbook = response['data'];
        return this.parseOrderBook (orderbook, orderbook['timestamp']);
    }

    parseTrade (trade, market = undefined) {
        let timestamp = trade['executed_at'];
        let price = parseFloat (trade['price']);
        let amount = parseFloat (trade['amount']);
        let symbol = market['symbol'];
        let cost = this.costToPrecision (symbol, price * amount);
        let id = this.safeString (trade, 'transaction_id');
        if (!id) {
            id = this.safeString (trade, 'trade_id');
        }
        let fee = undefined;
        if ('fee_amount_quote' in trade) {
            fee = {
                'currency': market['quote'],
                'cost': this.safeFloat (trade, 'fee_amount_quote'),
            };
        }
        return {
            'timestamp': timestamp,
            'datetime': this.iso8601 (timestamp),
            'symbol': symbol,
            'id': id,
            'order': this.safeString (trade, 'order_id'),
            'type': this.safeString (trade, 'type'),
            'side': trade['side'],
            'price': price,
            'amount': amount,
            'cost': cost,
            'fee': fee,
            'info': trade,
        };
    }

    async fetchTrades (symbol, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let trades = await this.publicGetPairTransactions (this.extend ({
            'pair': market['id'],
        }, params));
        return this.parseTrades (trades['data']['transactions'], market, since, limit);
    }

    parseOHLCV (ohlcv, market = undefined, timeframe = '5m', since = undefined, limit = undefined) {
        return [
            ohlcv[5],
            parseFloat (ohlcv[0]),
            parseFloat (ohlcv[1]),
            parseFloat (ohlcv[2]),
            parseFloat (ohlcv[3]),
            parseFloat (ohlcv[4]),
        ];
    }

    async fetchOHLCV (symbol, timeframe = '5m', since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let date = this.milliseconds ();
        date = this.ymd (date);
        date = date.split ('-');
        let response = await this.publicGetPairCandlestickCandleTypeYYYYMMDD (this.extend ({
            'pair': market['id'],
            'candle-type': this.timeframes[timeframe],
            'YYYYMMDD': date.join (''),
        }, params));
        let ohlcv = response['data']['candlestick'][0]['ohlcv'];
        return this.parseOHLCVs (ohlcv, market, timeframe, since, limit);
    }

    async fetchBalance (params = {}) {
        await this.loadMarkets ();
        let response = await this.privateGetUserAssets (params);
        let result = { 'info': response };
        let balances = response['data']['assets'];
        for (let i = 0; i < balances.length; i++) {
            let balance = balances[i];
            let id = balance['asset'];
            let currency = this.commonCurrencyCode (id);
            let account = {
                'free': parseFloat (balance['free_amount']),
                'used': parseFloat (balance['locked_amount']),
                'total': parseFloat (balance['onhand_amount']),
            };
            result[currency] = account;
        }
        return this.parseBalance (result);
    }

    parseOrder (order, market = undefined) {
        let marketId = this.safeString (order, 'pair');
        let symbol = undefined;
        if (marketId && !market && (marketId in this.marketsById)) {
            market = this.marketsById[marketId];
        }
        if (market)
            symbol = market['symbol'];
        let timestamp = this.safeInteger (order, 'ordered_at') * 1000;
        let price = parseFloat (order['price']);
        let amount = this.safeFloat (order, 'start_amount');
        let filled = this.safeFloat (order, 'executed_amount');
        let remaining = this.safeFloat (order, 'remaining_amount');
        let cost = filled * this.safeFloat (order, 'average_price');
        let status = this.safeString (order, 'status');
        // UNFILLED
        // PARTIALLY_FILLED
        // FULLY_FILLED
        // CANCELED_UNFILLED
        // CANCELED_PARTIALLY_FILLED
        if (status === 'FULLY_FILLED') {
            status = 'closed';
        } else if (status === 'CANCELED_UNFILLED' || status === 'CANCELED_PARTIALLY_FILLED') {
            status = 'canceled';
        } else {
            status = 'open';
        }
        return {
            'id': this.safeString (order, 'order_id'),
            'datetime': this.iso8601 (timestamp),
            'timestamp': timestamp,
            'status': status,
            'symbol': symbol,
            'type': order['type'],
            'side': order['side'],
            'price': price,
            'cost': cost,
            'amount': amount,
            'filled': filled,
            'remaining': remaining,
            'trades': undefined,
            'fee': undefined,
            'info': order,
        };
    }

    async createOrder (symbol, type, side, amount, price = undefined, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let request = {
            'pair': market['id'],
            'side': side,
            'amount': amount,
            'type': type,
        };
        if (type === 'limit')
            request['price'] = price;
        let response = await this.privatePostUserSpotOrder (this.extend (request, params));
        let id = response['data']['order_id'];
        let order = this.parseOrder (response['data'], market);
        this.orders[id] = order;
        return order;
    }

    async cancelOrder (id, symbol = undefined, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let response = await this.privatePostUserSpotCancelOrder (this.extend ({
            'order_id': id,
            'pair': market['id'],
        }, params));
        return response['data'];
    }

    async fetchOrder (id, symbol = undefined, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let response = await this.privateGetUserSpotOrder (this.extend ({
            'order_id': id,
            'pair': market['id'],
        }, params));
        return this.parseOrder (response['data']);
    }

    async fetchOpenOrders (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let request = {
            'pair': market['id'],
        };
        if (limit)
            request['count'] = limit;
        if (since)
            request['since'] = parseInt (since / 1000);
        let orders = await this.privateGetUserSpotActiveOrders (this.extend (request, params));
        return this.parseOrders (orders['data']['order_open'], market, since, limit);
    }

    async fetchMyTrades (symbol = undefined, since = undefined, limit = undefined, params = {}) {
        await this.loadMarkets ();
        let market = this.market (symbol);
        let request = {
            'pair': market['id'],
        };
        if (since) {
            request['since'] = since;
        }
        request['count'] = limit ? limit : 50;
        let trades = await this.privateGetUserSpotTradeHistory (this.extend (request, params));
        return this.parseTrades (trades['data']['trades'], market, since, limit);
    }

    async fetchDepositAddress (code, params = {}) {
        //
        // TODO: test
        //
        //     await this.loadMarkets ();
        //     let currency = this.currency (code);
        //     let response = await this.privatePostReturnDepositAddresses (this.extend ({
        //         'asset': currency['id'],
        //     }, params));
        //     // Not sure about this if there could be more accounts...
        //     let accounts = response['data']['accounts'];
        //     let address = this.safeString (accounts[0], 'address');
        //     let status = address ? 'ok' : 'none';
        //     return {
        //         'currency': currency,
        //         'address': address,
        //         'tag': undefined,
        //         'status': status,
        //         'info': response,
        //     };
        //
        throw new NotSupported (this.id + ' fetchDepositAddress is not implemented!');
    }

    async withdraw (code, amount, address, tag = undefined, params = {}) {
        //
        // TODO: test
        //
        //     if (!('uuid' in params)) {
        //         throw new ExchangeError (this.id + ' uuid is required for withdrawal');
        //     }
        //     await this.loadMarkets ();
        //     let currency = this.currency (code);
        //     let response = await this.privatePostRequestWithdrawal (this.extend ({
        //         'asset': currency['id'],
        //         'amount': amount,
        //     }, params));
        //     return {
        //         'info': response,
        //         'id': response['data']['txid'],
        //     };
        //
        throw new NotSupported (this.id + ' withdraw is not implemented!');
    }

    nonce () {
        return this.milliseconds ();
    }

    sign (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let query = this.omit (params, this.extractParams (path));
        let url = this.urls['api'][api] + '/' + this.implodeParams (path, params);
        if (api === 'public') {
            if (Object.keys (query).length)
                url += '?' + this.urlencode (query);
        } else {
            this.checkRequiredCredentials ();
            let nonce = this.nonce ().toString ();
            let auth = nonce + '/v1/' + path;
            if (method === 'POST') {
                body = this.json (query);
                auth += body;
            } else {
                url += path;
                query = this.urlencode (query);
                if (query.length) {
                    query += '?' + query;
                    url += query;
                    auth += query;
                }
            }
            headers = {
                'Content-Type': 'application/json',
                'ACCESS-KEY': this.apiKey,
                'ACCESS-NONCE': this.nonce (),
                'ACCESS-SIGNATURE': this.hmac (this.encode (auth), this.encode (this.secret)),
            };
        }
        return { 'url': url, 'method': method, 'body': body, 'headers': headers };
    }

    async request (path, api = 'public', method = 'GET', params = {}, headers = undefined, body = undefined) {
        let response = await this.fetch2 (path, api, method, params, headers, body);
        let success = this.safeInteger (response, 'success');
        let data = this.safeValue (response, 'data');
        if (!success || !data) {
            let errorMessages = {
                '10000': 'URL does not exist',
                '10001': 'A system error occurred. Please contact support',
                '10002': 'Invalid JSON format. Please check the contents of transmission',
                '10003': 'A system error occurred. Please contact support',
                '10005': 'A timeout error occurred. Please wait for a while and try again',
                '20001': 'API authentication failed',
                '20002': 'Illegal API key',
                '20003': 'API key does not exist',
                '20004': 'API Nonce does not exist',
                '20005': 'API signature does not exist',
                '20011': 'Two-step verification failed',
                '20014': 'SMS authentication failed',
                '30001': 'Please specify the order quantity',
                '30006': 'Please specify the order ID',
                '30007': 'Please specify the order ID array',
                '30009': 'Please specify the stock',
                '30012': 'Please specify the order price',
                '30013': 'Trade Please specify either',
                '30015': 'Please specify the order type',
                '30016': 'Please specify asset name',
                '30019': 'Please specify uuid',
                '30039': 'Please specify the amount to be withdrawn',
                '40001': 'The order quantity is invalid',
                '40006': 'Count value is invalid',
                '40007': 'End time is invalid',
                '40008': 'end_id Value is invalid',
                '40009': 'The from_id value is invalid',
                '40013': 'The order ID is invalid',
                '40014': 'The order ID array is invalid',
                '40015': 'Too many specified orders',
                '40017': 'Incorrect issue name',
                '40020': 'The order price is invalid',
                '40021': 'The trading classification is invalid',
                '40022': 'Start date is invalid',
                '40024': 'The order type is invalid',
                '40025': 'Incorrect asset name',
                '40028': 'uuid is invalid',
                '40048': 'The amount of withdrawal is illegal',
                '50003': 'Currently, this account is in a state where you can not perform the operation you specified. Please contact support',
                '50004': 'Currently, this account is temporarily registered. Please try again after registering your account',
                '50005': 'Currently, this account is locked. Please contact support',
                '50006': 'Currently, this account is locked. Please contact support',
                '50008': 'User identification has not been completed',
                '50009': 'Your order does not exist',
                '50010': 'Can not cancel specified order',
                '50011': 'API not found',
                '60001': 'The number of possessions is insufficient',
                '60002': 'It exceeds the quantity upper limit of the tender buying order',
                '60003': 'The specified quantity exceeds the limit',
                '60004': 'The specified quantity is below the threshold',
                '60005': 'The specified price is above the limit',
                '60006': 'The specified price is below the lower limit',
                '70001': 'A system error occurred. Please contact support',
                '70002': 'A system error occurred. Please contact support',
                '70003': 'A system error occurred. Please contact support',
                '70004': 'We are unable to accept orders as the transaction is currently suspended',
                '70005': 'Order can not be accepted because purchase order is currently suspended',
                '70006': 'We can not accept orders because we are currently unsubscribed ',
            };
            let errorClasses = {
                '20001': AuthenticationError,
                '20002': AuthenticationError,
                '20003': AuthenticationError,
                '20005': AuthenticationError,
                '20004': InvalidNonce,
                '40020': InvalidOrder,
                '40021': InvalidOrder,
                '40013': OrderNotFound,
                '40014': OrderNotFound,
                '50009': OrderNotFound,
                '50010': OrderNotFound,
                '60001': InsufficientFunds,
            };
            let code = this.safeInteger (data, 'code');
            let message = this.safeString (errorMessages, code, 'Error');
            let ErrorClass = this.safeValue (errorClasses, code, ExchangeError);
            throw new ErrorClass (message);
        }
        return response;
    }
};
