"use strict";

/*
 * Created with @iobroker/create-adapter v2.3.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const mSchedule = require("node-schedule");          // https://github.com/node-schedule/node-schedule
const moment = require("moment");


let busy = false;

// Load your modules here, e.g.:
// const fs = require("fs");
const EmVue = require("./lib/EmVue.js");

class Emporia extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: "emporia",
		});

		this.on("ready", this.onReady.bind(this));
		this.on("stateChange", this.onStateChange.bind(this));
		// this.on("objectChange", this.onObjectChange.bind(this));
		// this.on("message", this.onMessage.bind(this));
		this.on("unload", this.onUnload.bind(this));

		this.updateInterval = null;
		this.emVue = new EmVue();
	}



	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here
		// const tokens = await this.getTokenStates();
		// if (tokens) {
		// 	this.emVue.tokens = tokens;
		// 	this.log.info(`Tokens retrieved!`);
		// }else {
		// 	this.log.info(`no Tokens get new ones!`);
		// }

		const login = await this.emVue.login(this.config.user, this.config.password);
		this.log.info(`Login with user:${this.config.user}`);

		if (login) {
			this.updateTokenStates(this.emVue.tokens);
		}

		let res = await this.emVue.getEmpCustomer();

		if (res) {
			this.updateTokenStates(this.emVue.tokens);
			this.createCustomerStates(this.emVue.customer);
			this.log.info(`Username:${this.config.user} logged in`);
			this.log.info(`Time yesterday ${moment().utc().subtract(1, "days").startOf("day").format()}`);
			this.setState("info.connection", true, true);
		} else {
			this.setState("info.connection", false, true);
		}

		res = await this.emVue.getEmpDevices();
		if (res) {
			this.createDeviceStates(this.emVue.devices);
		}

		this.initSchedule();
		this.updateInterval = setInterval(() => {
			this.showUsage();
		}, this.config.refresh * 1000);

	}

	async createUsageStates(devices, stateName = "live") {

		devices.forEach(device => {
			const name = this.emVue.devices.list.find(x => x.deviceGid === device.deviceGid).locationProperties.deviceName;
			device.channelUsages.forEach(channel => {
				//this.log.info(`name:${channel.name} usage:${channel.usage}  ${this.emVue.calcLiveKilowatt(channel.usage,,this.config.unitoutput)}`);
				const kiloWatt = (stateName === "live") ? this.emVue.calcLiveKilowatt(channel.usage,this.config.unitoutput) : channel.usage;

				this.setObjectNotExistsAsync(`usage.${stateName}.${name}.${channel.name}`, { type: "state", common: { name: channel.name, type: "number", role: "value.power", read: true, write: false }, native: {}, });
				this.setState(`usage.${stateName}.${name}.${channel.name}`, kiloWatt, true, true);
			});
			//this.log.info("  ");
		});

	}

	async getTokenStates() {
		const tokens = {};

		const accessToken = await this.getStateAsync("tokens.accessToken");
		const idToken = await this.getStateAsync("tokens.idToken");
		const refreshToken = await this.getStateAsync("tokens.refreshToken");
		if (accessToken) tokens.AccessToken = accessToken.val;
		if (idToken) tokens.IdToken = idToken.val;
		if (refreshToken) tokens.RefreshToken = refreshToken.val;
		return tokens;
	}

	initSchedule() {

		const rndMinutes = Math.floor(Math.random() * 59);		// Randomize the start of the schedule
		const rndHours = Math.floor(Math.random() * 2);
		const schedule = `${rndMinutes} ${rndHours} * * *`;
		//const schedule = `20 * * * * *`;

		this.log.info(`Schedule daily values. ${schedule}`);

		this.schedule = mSchedule.scheduleJob(schedule, async () => {
			const dayDeviceUsage = await this.emVue.getEmpDayUsage();
			//this.log.info(JSON.stringify(dayDeviceUsage));
			this.log.info(`instant:${dayDeviceUsage.instant} scale:${dayDeviceUsage.scale} unit:${dayDeviceUsage.energyUnit}`);

			this.createUsageStates(dayDeviceUsage.devices, "day");
		});

	}

	async showUsage() {
		//const deviceNames = this.emVue.devices.list.map(d => d.locationProperties.deviceName).join(",");
		//const usedDevices = this.emVue.devices.list.map(d => d.locationProperties.deviceName);
		// @ts-ignore
		const isActivated = (await this.getStateAsync("devices.activated")).val;

		if (isActivated && !busy) {
			if (!busy) {
				busy = true;
				//this.log.info(`getting live power usage for ${deviceNames} `);
				// eslint-disable-next-line prefer-const
				let deviceListUsages = await this.emVue.getEmpDeviceListUsage();
				if (deviceListUsages && deviceListUsages.devices) {
					//this.log.info(JSON.stringify(`${(JSON.stringify(deviceListUsages))}`));
					this.createUsageStates(deviceListUsages.devices);
				}
				busy = false;
			} else {
				this.log.info("retrieving data is not done  -> busy");
			}
		} else {
			this.log.info("retrieving data is not active set the state activated under devices to true");
		}
	}

	async updateTokenStates(credentials) {
		this.setObjectNotExistsAsync(`tokens.accessToken`, { type: "state", common: { name: "accessToken", type: "string", role: "state", read: true, write: false }, native: {}, });
		this.setState(`tokens.accessToken`, credentials.AccessToken, true, true);

		this.setObjectNotExistsAsync(`tokens.idToken`, { type: "state", common: { name: "idToken", type: "string", role: "state", read: true, write: false }, native: {}, });
		this.setState(`tokens.idToken`, credentials.IdToken, true, true);

		this.setObjectNotExistsAsync(`tokens.refreshToken`, { type: "state", common: { name: "refreshToken", type: "string", role: "state", read: true, write: false }, native: {}, });
		this.setState(`tokens.refreshToken`, credentials.RefreshToken, true, true);
	}

	async createCustomerStates(customer) {

		this.setObjectNotExistsAsync(`customer.firstName`, { type: "state", common: { name: "firstName", type: "string", role: "name", read: true, write: false }, native: {}, });
		this.setState(`customer.firstName`, customer.firstName, true, true);

		this.setObjectNotExistsAsync(`customer.lastName`, { type: "state", common: { name: "lastName", type: "string", role: "name ", read: true, write: false }, native: {}, });
		this.setState(`customer.lastName`, customer.lastName, true, true);

		this.setObjectNotExistsAsync(`customer.email`, { type: "state", common: { name: "email", type: "string", role: "text ", read: true, write: false }, native: {}, });
		this.setState(`customer.email`, customer.email, true, true);

		this.setObjectNotExistsAsync(`customer.customerGid`, { type: "state", common: { name: "customerGid", type: "number", role: "name", read: true, write: false }, native: {}, });
		this.setState(`customer.customerGid`, customer.customerGid, true, true);

		this.setObjectNotExistsAsync(`customer.createdAt`, { type: "state", common: { name: "createdAt", type: "string", role: "date", read: true, write: false }, native: {}, });
		this.setState(`customer.createdAt`, customer.createdAt, true, true);

	}

	createDeviceStates(devices) {
		devices.list.forEach(dev => {

			const id = `devices.${dev.locationProperties.deviceName}`;

			this.setObjectNotExistsAsync("devices.activated", { type: "state", common: { name: "test", type: "boolean", role: "switch", read: true, write: true }, native: {}, });
			this.getStateAsync("devices.activated").
				then(state => {
					if (!state || state.val === null)
						this.setState("devices.activated", true, true, true);
				});

			this.setObjectNotExistsAsync(id + ".model", { type: "state", common: { name: "model", type: "string", role: "info.name", read: true, write: false }, native: {}, });
			this.setState(id + ".model", dev.model, true, true);

			this.setObjectNotExistsAsync(id + ".firmware", { type: "state", common: { name: "firmware", type: "string", role: "info.firmware", read: true, write: false }, native: {}, });
			this.setState(id + ".firmware", dev.firmware, true, true);

			this.setObjectNotExistsAsync(id + ".deviceGid", { type: "state", common: { name: "deviceGid", type: "number", role: "value", read: true, write: false }, native: {}, });
			this.setState(id + ".deviceGid", dev.deviceGid, true, true);

			this.setObjectNotExistsAsync(id + ".timeZone", { type: "state", common: { name: "timeZone", type: "string", role: "date", read: true, write: false }, native: {}, });
			this.setState(id + ".timeZone", dev.locationProperties.timeZone, true, true);

			if (dev.locationProperties.usageCentPerKwHours) {
				this.setObjectNotExistsAsync(id + ".centPerKwHour", { type: "state", common: { name: "centPerKwHour", type: "string", role: "name", read: true, write: false }, native: {}, });
				this.setState(id + ".centPerKwHour", dev.locationProperties.usageCentPerKwHours, true, true);
			}
		});


	}
	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	onUnload(callback) {
		try {
			// Here you must clear all timeouts or intervals that may still be active
			// clearTimeout(timeout1);
			// clearTimeout(timeout2);
			// ...
			// clearInterval(interval1);
			if (this.updateInterval) {
				clearInterval(this.updateInterval);
				this.updateInterval = null;
			}
			if (this.schedule) {
				this.schedule.cancel();
			}
			callback();
		} catch (e) {
			callback();
		}
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	onStateChange(id, state) {
		if (state) {
			// The state was changed
			this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
		} else {
			// The state was deleted
			this.log.info(`state ${id} deleted`);
		}
	}

	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === "object" && obj.message) {
	// 		if (obj.command === "send") {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info("send command");

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, "Message received", obj.callback);
	// 		}
	// 	}
	// }

}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new Emporia(options);
} else {
	// otherwise start the instance directly
	new Emporia();
}