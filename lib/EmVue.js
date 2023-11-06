"use strict";

//const fs = require("fs");
// const AWS = require("aws-sdk");
const CognitoSDK = require("amazon-cognito-identity-js-node");
const request = require("request");
const moment = require("moment");


const Scale = {
	SECOND: "1S",
	MINUTE: "1MIN",
	MINUTES_15: "15MIN",
	HOUR: "1H",
	DAY: "1D",
	WEEK: "1W",
	MONTH: "1MON",
	YEAR: "1Y"
};

const Unit = {
	KWH: "KilowattHours",
	USD: "Dollars",
	AMPHOURS: "AmpHours",
	TREES: "Trees",
	GAS: "GallonsOfGas",
	DRIVEN: "MilesDriven",
	CARBON: "Carbon",
};


class EmVue {
	// @eslint-ignore
	// _customer
	// _devices

	constructor() {
		//this.userCred = this.setUserCredentials();
		this._customer = {};
		this._tokens = {};
		this._devices = {};
		this._outlets = {};
		this.userCred = {
			clientId: "4qte47jbstod8apnfic0bunmrq",
			userPoolId: "us-east-2_ghlOXVLi1",
			userRegion: "us-east-2"
		};
	}

	// Properties
	get tokens() {
		return this._tokens;
	}
	set tokens(token) {
		this._tokens = token;
	}

	get devices() {
		return this._devices;
	}
	get outlets() {
		return this._outlets;
	}

	get customer() {
		return this._customer;
	}

	async getAWSCredentials(user, password) {
		try {

			//User Pool
			const poolData = { UserPoolId: this.userCred.userPoolId, ClientId: this.userCred.clientId };
			//const userPool1 = new AWS.CognitoIdentityServiceProvider.CognitoUserPool(poolData);
			const userPool = new CognitoSDK.CognitoUserPool(poolData);

			const userParams = { Pool: userPool, Username: user };
			// const cognitoUser1 = new AWS.CognitoIdentityServiceProvider.CognitoUser(userParams);
			const cognitoUser = new CognitoSDK.CognitoUser(userParams);

			//Authentication
			const authenticationData = { Username: user, Password: password };
			//const authenticationDetails = new AWS.CognitoIdentityServiceProvider.AuthenticationDetails(authenticationData);
			const authenticationDetails = new CognitoSDK.AuthenticationDetails(authenticationData);

			const tokens = await this.asyncAuthenticateUser(cognitoUser, authenticationDetails);
			if (tokens) {
				this._tokens.AccessToken = tokens.accessToken.jwtToken;
				this._tokens.IdToken = tokens.idToken.jwtToken;
				this._tokens.RefreshToken = tokens.refreshToken.token;
				return true;
			} else
				return false;
		} catch (err) {
			return (err);
		}
	}

	async login(user, password) {
		try {
			if (!this._tokens.IdToken || !this._tokens.RefreshToken || !this._tokens.AccessToken) {
				const res = await this.getAWSCredentials(user, password);
				return res;
			} else {
				return true;
			}
		} catch (e) {
			return (e);
		}
	}

	asyncAuthenticateUser(cognitoUser, cognitoAuthenticationDetails) {
		return new Promise(function (resolve, reject) {
			cognitoUser.authenticateUser(cognitoAuthenticationDetails, {
				onSuccess: function (result) {
					resolve(result);
				},
				onFailure: (err) => {
					console.log(err);
					reject(err);
				},
				newPasswordRequired: (userAttributes) => {
					console.log("newPW");
					delete userAttributes.email_verified;
					cognitoUser.completeNewPasswordChallenge(userAttributes.Password, { email: userAttributes.email });

				}
			});
		}.bind(this));
	}

	storeTokens(credentials) {
		//console.log(`AccessToken ${credentials.AccessToken}`);
		if (credentials.AccessToken) this._tokens.AccessToken = credentials.AccessToken;
		if (credentials.IdToken) this._tokens.IdToken = credentials.IdToken;
		//if (credentials.ExpiresIn) this._tokens.ExpiresIn = credentials.ExpiresIn;
	}

	async getNewTokens() {
		const url = `https://cognito-idp.${this.userCred.userRegion}.amazonaws.com/`;
		const params = {
			headers: {
				"X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
				"Content-Type": "application/x-amz-json-1.1"
			},
			method: "POST",
			body: JSON.stringify({
				"ClientId": this.userCred.clientId,
				"AuthFlow": "REFRESH_TOKEN_AUTH",
				"AuthParameters": {
					"REFRESH_TOKEN": this._tokens.RefreshToken,
					"SECRET_HASH": this.userCred.userPoolId
				}
			})
		};
		return new Promise((resolve, reject) => {
			try {
				request(url, params, (error, response, body) => {
					let data;
					if (!error) {
						data = JSON.parse(body);
						resolve([response.statusCode, data]);
					} else {
						reject([response.statusCode, data]);
					}
				});
			} catch (err) {
				console.log(err);
			}
		});

	}

	async getEmpDayUsage() {
		try {

			let [status, data] = await this.getPromiseDeviceListUsage({ instant: moment().utc().subtract(1, "days").startOf("day").format(), scale: "1D" });

			if (status === 401) {           // token expired
				[status, data] = await this.getNewTokens();
				this.storeTokens(data.AuthenticationResult);
				[status, data] = await this.getPromiseDeviceListUsage({ instant: moment().utc().subtract(1, "days").startOf("day").format(), scale: "1D" });
				if (status === 401) {
					return false;
				} else {
					return data;
				}
			} else {
				return data;
			}
		}
		catch (err) {
			throw err.message;
		}
	}

	async getEmpDeviceListUsage() {
		let [status, data] = await this.getPromiseDeviceListUsage({});
		//console.log("test");
		if (status === 401) {           // token expired
			[status, data] = await this.getNewTokens();
			this.storeTokens(data.AuthenticationResult);
			[status, data] = await this.getPromiseDeviceListUsage({});
			if (status === 401) {
				return false;
			} else {
				//devices = this.calcKilowatt(data, outputunits);
				return data;
			}
		} else {
			//devices = this.calcKilowatt(data, outputunits);
			return data;
		}
	}

	calcLiveKilowatt(usage, unitOutput = 0) {
		if (unitOutput === 1)
			return (usage * 3600 * 1000 / 1);	// Watt
		else
			return (usage * 3600);	// KW
	}

	async getPromiseGetChartUsage({ instant = moment.utc().format(), scale = Scale.SECOND, unit = Unit.KWH }) {
		const deviceGids = this._devices.list.map(d => d.deviceGid).join("+");
		const url = `https://api.emporiaenergy.com/AppAPI?apiMethod=getDeviceListUsages&deviceGids=${deviceGids}&instant=${instant}&scale=${scale}&energyUnit=${unit}`;

		const params = {
			headers: {
				authtoken: this._tokens.IdToken
			},
			method: "GET",
		};
		return new Promise(function (resolve, reject) {
			request(url, params, (error, response, body) => {
				if (!error) {
					const data = JSON.parse(body);
					resolve([response.statusCode, data.deviceListUsages.devices]);
				} else {
					reject(error);
				}
			});
		});
	}


	async getPromiseDeviceListUsage({ instant = moment.utc().format(), scale = Scale.SECOND, unit = Unit.KWH }) {

		if (this._devices && this._devices.list) {
			const deviceGids = this._devices.list.map(d => d.deviceGid).join("+");
			const url = `https://api.emporiaenergy.com/AppAPI?apiMethod=getDeviceListUsages&deviceGids=${deviceGids}&instant=${instant}&scale=${scale}&energyUnit=${unit}`;

			const params = {
				headers: {
					authtoken: this._tokens.IdToken
				},
				method: "GET",
			};

			return new Promise(function (resolve, reject) {

				request(url, params, (error, response, body) => {
					if (!error) {
						const data = JSON.parse(body);
						resolve([response.statusCode, data.deviceListUsages]);
					} else {
						reject(error);
					}
				});
			});

		} else {
			return ("Error:Devicelist empty");
		}

	}

	async getEmpCustomer(user) {
		try {

			let [status, data] = await this.getAWSCustomer(user);
			if (status === 401) {           // token expired
				[status, data] = await this.getNewTokens();
				this.storeTokens(data.AuthenticationResult);
				[status, data] = await this.getAWSCustomer(user);
				if (status === 200) {
					this._customer = data;
					return (status);
				} else {
					return (status);
				}
			} else {
				this._customer = data;
				return (status);
			}
		} catch (err) {
			return (err);
		}
	}

	async getAWSCustomer(user) {
		try {
			const url = `https://api.emporiaenergy.com/customers?email=${user}`;
			const params = {
				headers: {
					authtoken: this._tokens.IdToken
				},
				method: "GET"
			};
			return new Promise((resolve, reject) => {
				request(url, params, (error, response, body) => {
					if (!error) {
						const data = JSON.parse(body);
						resolve([response.statusCode, data]);
					} else {
						reject(error);
					}
				});
			});
		}
		catch (err) {
			console.log(err);
		}
	}

	async getEmpDevices() {
		try {
			const [status, data] = await this.getDevicesPromise();

			if (status === 200) {
				this._devices.list = data;
				return true;
			} else {
				return false;
			}
		} catch (err) {
			return err;
		}
	}

	/* async getEmpOutlets1() {
		try {
			const [status, data] = await this.getOutletsPromise();
			//if (status === 200) {
			this._outlets.list = data;
			return status;
			//} else {
			//return status;
			//}

		} catch (err) {
			return err;
		}
	} */

	/* async getOutletsPromise1() {
		const url = `https://api.emporiaenergy.com/customers/outlets`;
		const params = {
			headers: {
				authtoken: this._tokens.IdToken
			},
			method: "GET",
		};
		return new Promise((resolve, reject) => {
			request(url, params, (error, response, body) => {
				if (!error) {
					const data = JSON.parse(body);
					resolve([response.statusCode, data]);
				} else {
					reject(error);
				}
			});
		});
	}
 */
	async getEmpOutlets() {
		try {
			const [status, data] = await this.getOutletsPromise();
			if (status === 200 && data.outlets) {
				this._outlets.list = data.outlets;
			} else {
				return status;
			}

		} catch (err) {
			return err;
		}
	}

	async getOutletsPromise() {
		const url = `https://api.emporiaenergy.com/customers/devices/status`;
		const params = {
			headers: {
				authtoken: this._tokens.IdToken
			},
			method: "GET",
		};
		return new Promise((resolve, reject) => {
			request(url, params, (error, response, body) => {
				if (!error) {
					const data = JSON.parse(body);
					resolve([response.statusCode, data]);
				} else {
					reject(error);
				}
			});
		});
	}

	async putEmpOutlet(id, value) {
		try {
			if(!await this.putOutletPromise(id, value))
			{
				//this._outlets.list = data.outlets;
				return true;
			} else {
				return false;
			}

		} catch (err) {
			return err;
		}
	}

	async putOutletPromise(devideGid, value) {
		const url = `https://api.emporiaenergy.com/devices/outlet`;
		const params = {
			headers: {
				authtoken: this._tokens.IdToken
			},
			deviceGid: devideGid,
			outletOn: value,
			method: "PUT"
		};
		return new Promise((resolve, reject) => {
			request(url, params, (error, response, body) => {
				if (!error) {
					//const data = JSON.parse(body);
					resolve(response.statusCode);
				} else {
					reject(error);
				}
			});
		});
	}

	async getDevicesPromise() {

		const url = `https://api.emporiaenergy.com/customers/devices`;
		const params = {
			headers: {
				authtoken: this._tokens.IdToken
			},
			method: "GET",
		};

		return new Promise((resolve, reject) => {
			request(url, params, (error, response, body) => {
				if (!error) {
					const data = JSON.parse(body);
					resolve([response.statusCode, data.devices]);
				} else {
					reject(error);
				}
			});
		});
	}

}


//module.exports = EmVue;
module.exports = EmVue;
exports.Scale = Scale;
//module.exports = Scale;
