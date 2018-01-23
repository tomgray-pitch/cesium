define([
        '../Core/Check',
        '../Core/defaultValue',
        '../Core/defined',
        '../Core/loadJson',
        '../Core/Resource',
        '../Core/RuntimeError',
        '../ThirdParty/when',
        './ArcGisMapServerImageryProvider',
        './BingMapsImageryProvider',
        './CesiumIonResource',
        './createTileMapServiceImageryProvider',
        './GoogleEarthEnterpriseMapsProvider',
        './MapboxImageryProvider',
        './SingleTileImageryProvider',
        './UrlTemplateImageryProvider',
        './WebMapServiceImageryProvider',
        './WebMapTileServiceImageryProvider'
    ], function(
        Check,
        defaultValue,
        defined,
        loadJson,
        Resource,
        RuntimeError,
        when,
        ArcGisMapServerImageryProvider,
        BingMapsImageryProvider,
        CesiumIonResource,
        createTileMapServiceImageryProvider,
        GoogleEarthEnterpriseMapsProvider,
        MapboxImageryProvider,
        SingleTileImageryProvider,
        UrlTemplateImageryProvider,
        WebMapServiceImageryProvider,
        WebMapTileServiceImageryProvider) {
    'use strict';

    /**
     * Utility object for working with the Cesium ion API.
     *
     * @see https://cesium.com
     *
     * @exports CesiumIon
     *
     * @experimental This class is part of Cesium ion beta functionality and may change without our normal deprecation policy.
     */
    var CesiumIon = {};

    /**
     * The default Cesium ion access token to use.
     *
     * @type {String}
     */
    CesiumIon.defaultAccessToken = undefined;

    /**
     * The default Cesium ion server to use.
     *
     * @type {String}
     * @default https://api.cesium.com
     */
    CesiumIon.defaultServerUrl = 'https://api.cesium.com';

    /**
     * Asynchronously creates a {@link Resource} representing a Cesium ion asset.
     *
     * @param {Number} assetId The Cesium ion asset id.
     * @param {Object} [options] An object with the following properties:
     * @param {String} [options.accessToken=CesiumIon.defaultAccessToken] The access token to use.
     * @param {String} [options.serverUrl=CesiumIon.defaultServerUrl] The url to the Cesium ion API server.
     * @returns {Promise.<Resource>} A Promise to a Resource representing the Cesium ion Asset.
     *
     * @example
     * //Load a Cesium3DTileset with asset ID of 124624234
     * Cesium.CesiumIon.createResource(124624234)
     *   .then(function (resource) {
     *     viewer.scene.primitives.add(new Cesium.Cesium3DTileset({ url: resource }));
     * });
     *
     * @example
     * //Load a CZML file with asset ID of 10890
     * Cesium.CesiumIon.createResource(10890)
     *   .then(function (resource) {
     *     viewer.dataSources.add(Cesium.CzmlDataSource.load(resource));
     *   });
     *
     * @example
     * //Load an ImageryProvider with asset ID of 2347923
     * Cesium.CesiumIon.createResource(2347923)
     *   .then(function (resource) {
     *     viewer.imageryLayers.addProvider(Cesium.createTileMapServiceImageryProvider({url : resource }));
     *   });
     */
    CesiumIon.createResource = function(assetId, options) {
        var endpointResource = CesiumIon._createEndpointResource(assetId, options);

        return CesiumIon._loadJson(endpointResource)
            .then(function (endpoint) {

                var externalType = endpoint.externalType;
                if (!defined(externalType)) {
                    return CesiumIonResource.create(endpoint, endpointResource);
                }

                // 3D Tiles and STK Terrain Server external assets can still be represented as a resource
                // object, just not the CesiumIonResource object.
                if (externalType === '3DTILES' || externalType === 'STK_TERRAIN_SERVER') {
                    return new Resource({ url: endpoint.options.url });
                }

                //External imagery assets have additional configuration that can't be represented as a Resource
                throw new RuntimeError('CesiumIon.createResource does not support external imagery assets; use CesiumIon.createImageryProvider instead.');
            });
    };

    /**
     * @private
     */
    CesiumIon._createEndpointResource = function (assetId, options) {
        //>>includeStart('debug', pragmas.debug);
        Check.defined('assetId', assetId);
        //>>includeEnd('debug');

        options = defaultValue(options, defaultValue.EMPTY_OBJECT);
        var serverUrl = defaultValue(options.serverUrl, CesiumIon.defaultServerUrl);
        var accessToken = defaultValue(options.accessToken, CesiumIon.defaultAccessToken);

        var resourceOptions = {
            url: serverUrl + '/v1/assets/' + assetId + '/endpoint'
        };

        if (defined(accessToken)) {
            resourceOptions.queryParameters = { access_token: accessToken };
        }

        return new Resource(resourceOptions);
    };

    function createFactory(Type) {
        return function(options) {
            return new Type(options);
        };
    }

    // These values are the unofficial list of supported external imagery
    // assets in the Cesium ion beta. They are subject to change.
    var ImageryProviderMapping = {
        ARCGIS_MAPSERVER: createFactory(ArcGisMapServerImageryProvider),
        BING: createFactory(BingMapsImageryProvider),
        GOOGLE_EARTH: createFactory(GoogleEarthEnterpriseMapsProvider),
        MAPBOX: createFactory(MapboxImageryProvider),
        SINGLE_TILE: createFactory(SingleTileImageryProvider),
        TMS: createTileMapServiceImageryProvider,
        URL_TEMPLATE: createFactory(UrlTemplateImageryProvider),
        WMS: createFactory(WebMapServiceImageryProvider),
        WMTS: createFactory(WebMapTileServiceImageryProvider)
    };

    /**
     * Creates an {@link ImageryProvider} representing a Cesium ion imagery asset.
     * Unlike {@link CesiumIon.createResource}, this function supports external asset functionality.
     *
     * @param {Number} assetId The Cesium ion asset id.
     * @param {Object} [options] An object with the following properties:
     * @param {String} [options.accessToken=CesiumIon.defaultAccessToken] The access token to use.
     * @param {String} [options.serverUrl=CesiumIon.defaultServerUrl] The url to the Cesium ion API server.
     * @returns {Promise<ImageryProvider>} A promise to an imagery provider presenting the requested Cesium ion Asset.
     *
     * @example
     * //Load an ImageryProvider with asset ID of 2347923
     * Cesium.CesiumIon.createImageryProvider(2347923)
     *   .then(function (imageryProvider) {
     *     viewer.imageryLayers.addProvider(imageryProvider);
     *   });
     */
    CesiumIon.createImageryProvider = function(assetId, options) {
        var endpointResource = CesiumIon._createEndpointResource(assetId, options);

        return CesiumIon._loadJson(endpointResource)
            .then(function(endpoint) {

                if (endpoint.type !== 'IMAGERY') {
                    throw new RuntimeError('Cesium ion asset ' + assetId + ' is not an imagery asset.');
                }

                var externalType = endpoint.externalType;
                if (!defined(externalType)) {
                    return createTileMapServiceImageryProvider({
                        url: CesiumIonResource.create(endpoint, endpointResource)
                    });
                }

                var factory = ImageryProviderMapping[externalType];

                if (!defined(factory)) {
                    throw new RuntimeError('Unrecognized Cesium ion imagery type: ' + externalType);
                }

                return factory(endpoint.options);
            });
    };

    //Exposed for testing
    CesiumIon._loadJson = function(resource) {
        return resource.fetchJson();
    };

    return CesiumIon;
});
