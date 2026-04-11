"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var puppeteer_1 = require("puppeteer");
var express_1 = require("express");
function createServer() {
    return __awaiter(this, void 0, void 0, function () {
        var app;
        var _this = this;
        return __generator(this, function (_a) {
            app = (0, express_1["default"])();
            app.use(express_1["default"].json());
            app.get('/', function (req, res) {
                console.log('test');
                return res.status(200).json({
                    message: 'Use POST request with Body params url & cookies',
                    success: true
                });
            });
            app.post('/', function (req, res) { return __awaiter(_this, void 0, void 0, function () {
                var _a, url, cookies, actions, browser, page, _i, actions_1, action, selector, value, selector, selector, value, content, newCookies, error_1;
                var _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            _a = req.body, url = _a.url, cookies = _a.cookies, actions = _a.actions;
                            if (!url) {
                                return [2 /*return*/, (_b = res === null || res === void 0 ? void 0 : res.status(400)) === null || _b === void 0 ? void 0 : _b.json({ error: "URL required!" })];
                            }
                            return [4 /*yield*/, puppeteer_1["default"].launch({ headless: true, defaultViewport: { width: 1920, height: 1080 } })];
                        case 1:
                            browser = _c.sent();
                            return [4 /*yield*/, browser.newPage()];
                        case 2:
                            page = _c.sent();
                            return [4 /*yield*/, page.setRequestInterception(true)];
                        case 3:
                            _c.sent();
                            page.on('request', function (request) {
                                var resourceType = request.resourceType();
                                var url = request.url();
                                // Блокируем ненужные ресурсы (изображения, стили, шрифты, видео)
                                var blockedTypes = ['image', 'stylesheet', 'font', 'media'];
                                if (blockedTypes.includes(resourceType)) {
                                    request.abort();
                                    return;
                                }
                                // Блокируем все сторонние запросы (не относящиеся к загружаемому сайту)
                                var pageHost = new URL(page.url()).hostname; // Домен загружаемой страницы
                                var requestHost = new URL(url).hostname; // Домен запроса
                                if (!requestHost.includes(pageHost)) {
                                    console.log("Blocked: ".concat(url));
                                    request.abort();
                                    return;
                                }
                                request["continue"]();
                            });
                            if (!(cookies && Array.isArray(cookies))) return [3 /*break*/, 5];
                            return [4 /*yield*/, browser.setCookie.apply(browser, cookies)];
                        case 4:
                            _c.sent();
                            _c.label = 5;
                        case 5:
                            _c.trys.push([5, 21, , 23]);
                            console.log('goto', url);
                            return [4 /*yield*/, page.goto(url, {
                                    waitUntil: ['domcontentloaded', 'networkidle0', 'networkidle2', 'load'],
                                    timeout: 1000000,
                                    referer: url
                                })];
                        case 6:
                            _c.sent();
                            if (!(actions && Array.isArray(actions))) return [3 /*break*/, 17];
                            console.log('actions:');
                            _i = 0, actions_1 = actions;
                            _c.label = 7;
                        case 7:
                            if (!(_i < actions_1.length)) return [3 /*break*/, 17];
                            action = actions_1[_i];
                            if (!(action.type === 'fill')) return [3 /*break*/, 9];
                            selector = action.selector, value = action.value;
                            console.log("Filling field ".concat(selector, " with value ").concat(value));
                            return [4 /*yield*/, page.type(selector, value)];
                        case 8:
                            _c.sent();
                            _c.label = 9;
                        case 9:
                            if (!(action.type === 'click')) return [3 /*break*/, 11];
                            selector = action.selector;
                            console.log("Clicking element ".concat(selector));
                            return [4 /*yield*/, page.click(selector)];
                        case 10:
                            _c.sent();
                            _c.label = 11;
                        case 11:
                            if (!(action.type === 'select')) return [3 /*break*/, 13];
                            selector = action.selector, value = action.value;
                            console.log("Selecting value ".concat(value, " from ").concat(selector));
                            return [4 /*yield*/, page.select(selector, value)];
                        case 12:
                            _c.sent();
                            _c.label = 13;
                        case 13: return [4 /*yield*/, page.waitForNetworkIdle()];
                        case 14:
                            _c.sent();
                            return [4 /*yield*/, page.waitForNavigation({ waitUntil: ['domcontentloaded', 'networkidle0', 'networkidle2', 'load'] })];
                        case 15:
                            _c.sent();
                            _c.label = 16;
                        case 16:
                            _i++;
                            return [3 /*break*/, 7];
                        case 17: return [4 /*yield*/, page.content()];
                        case 18:
                            content = _c.sent();
                            return [4 /*yield*/, browser.cookies()];
                        case 19:
                            newCookies = _c.sent();
                            return [4 /*yield*/, browser.close()];
                        case 20:
                            _c.sent();
                            res === null || res === void 0 ? void 0 : res.json({ html: content, cookies: newCookies });
                            return [3 /*break*/, 23];
                        case 21:
                            error_1 = _c.sent();
                            console.log('Error', error_1);
                            return [4 /*yield*/, browser.close()];
                        case 22:
                            _c.sent();
                            res.status(500).json({ error: "Error during load page", details: error_1 });
                            return [3 /*break*/, 23];
                        case 23: return [2 /*return*/];
                    }
                });
            }); });
            app.listen(9999, function () {
                console.log("🚀 Server Auto Browser started http://localhost:9999");
            });
            return [2 /*return*/];
        });
    });
}
createServer().then();
