import { DomUtil, Util, DomEvent } from "leaflet";

import { BlanketOverlay } from "./BlanketOverlay.js";

import Platina from "gleo/Platina.mjs";
import RawGeometry from "gleo/geometry/RawGeometry.mjs";
import epsg3857 from "gleo/crs/epsg3857.mjs";
import epsg4326 from "gleo/crs/epsg4326.mjs";

const CanvasBlanket = BlanketOverlay.extend({
	options: {
		attribution: "Gleo",
	},

	initialize(options) {
		Util.setOptions(this, options);
		this._container = DomUtil.create("canvas");
		this._container.classList.add("leaflet-zoom-animated");
		this._container.style.zIndex = 99;	// Keep beneath L.Canvas
	},

	_initContainer() {
		// noop, container has already been created in constructor
	},

	_destroyContainer() {
		DomEvent.off(this._container);
		this._container.remove();
	},
});

export default class LeafletGleo extends Platina {
	constructor(leafletMap, { continuous = true, ...options } = {}) {
		const canvasBlanket = new CanvasBlanket({
			continuous,
			...options,
		}).addTo(leafletMap);

		super(canvasBlanket._container, {
			...options,
			crs: epsg3857,
		});

		canvasBlanket._onSettled = function _onSettled() {
			const { lat, lng } = leafletMap.getCenter();
			this.setView({
				center: new RawGeometry(epsg4326, [lng, lat]),

				// zoom 0 is 156543 CRS units per pixel ( ≃ 20037508.34 / 128 )
				scale: this.zoomLevelToScale( leafletMap.getZoom()),
			});
		}.bind(this);

		leafletMap.whenReady(()=>canvasBlanket._onSettled());

		if (leafletMap.options.preferCanvas) {
			/// NOTE: The Leaflet map currently has a L.Canvas blanketing the map
			/// surface, and on top (stacking-context-wise) of the Platina.
			/// This means that pointer events are captured by the L.Renderer, and
			/// don't reach the Platina's <canvas>.
			/// The workaround is to listen to the pointer events on the L.Map
			/// instance, and dispatch those into the platina.
			/// Ideally, there should be a check to compare ev.originalEvent.target
			/// against the platina's <canvas>, to really check that the event
			/// did not originate from it.
			const mapContainer = leafletMap.getContainer();
			for (let evName of [
				"click",
				"dblclick",
				"auxclick",
				"contextmenu",
				"pointerover",
				"pointerenter",
				"pointerdown",
				"pointermove",
				"pointerup",
				"pointercancel",
				"pointerout",
				"pointerleave",
				"gotpointercapture",
				"lostpointercapture",
			]) {
				// leafletMap.addEventListener(evName, ev=>this._onPointerEvent(ev.originalEvent));
				mapContainer.addEventListener(evName, ev=>this._onPointerEvent(ev));
			}

			leafletMap.whenReady(()=>{
				this.#cursorTarget = leafletMap.getRenderer(new Path())._container;
			});
		} else {
			this.#cursorTarget = this.canvas;
		}
	}

	/// As per the Platina implementation of (un)queueCursor, but will affect
	/// *either* the Platina's `<canvas>` or the L.Canvas' `<canvas>`.
	#cursorTarget;
	#cursorQueue = [];
	queueCursor(cursor) {
		if (this.#cursorQueue.length === 0) {
			this.#cursorTarget.style.cursor = cursor;
		}
		this.#cursorQueue.push();
	}

	unqueueCursor(cursor) {
		this.#cursorQueue.splice(this.#cursorQueue.indexOf(cursor), 1);
		this.#cursorTarget.style.cursor =
			this.#cursorQueue.length === 0 ? "" : this.#cursorQueue[0];
	}


	// Given a Leaflet zoom level, returns the corresponding Gleo scale factor
	// for EPSG:3857.
	zoomLevelToScale(level) {
		// zoom 0 is 156543 CRS units per pixel ( ≃ 20037508.34 / 128 )
		return 156543.03392804097 / Math.pow(2, level) / (devicePixelRatio ?? 1);
	}

	// Given a Gleo scale factor in EPSG:3857, return the corresponding Leaflet
	// zoom level
	scaleToZoomLevel(scale) {
		return Math.log2(156543.03392804097 / scale) * (devicePixelRatio ?? 1);
	}
}
