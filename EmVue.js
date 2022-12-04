
const fs = require("fs");
// const AWS = require("aws-sdk");
const CognitoSDK = require("amazon-cognito-identity-js-node");
const request = require("request");
const moment = require("moment");

const CLIENT_ID = "4qte47jbstod8apnfic0bunmrq";
const USER_POOL = "us-east-2_ghlOXVLi1";

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
		this.userCred = this.getUserCredentialsfromFile();
		this._customer = {};

		this._devices = {
			// deviceList:  [],
			// list: [],
			// deviceGids: [],
			// usage: []
		};
		//this._devicesUsage = {}
	}

	//userCred = {};

	// Properties
	get devices() {
		return this._devices;
	}

	get customer() {
		return this._customer;
	}

	async getAWSCredentials() {
		// AWS.CognitoIdentityServiceProvider.AuthenticationDetails = CognitoSDK.AuthenticationDetails;
		// AWS.CognitoIdentityServiceProvider.CognitoUserPool = CognitoSDK.CognitoUserPool;
		// AWS.CognitoIdentityServiceProvider.CognitoUser = CognitoSDK.CognitoUser;

		//User Pool
		const poolData = { UserPoolId: this.userCred.UserPoolId, ClientId: this.userCred.ClientId };
		//const userPool1 = new AWS.CognitoIdentityServiceProvider.CognitoUserPool(poolData);
		const userPool = new CognitoSDK.CognitoUserPool(poolData);

		const userParams = { Pool: userPool, Username: this.userCred.Username };
		// const cognitoUser1 = new AWS.CognitoIdentityServiceProvider.CognitoUser(userParams);
		const cognitoUser = new CognitoSDK.CognitoUser(userParams);

		//Authentication
		const authenticationData = { Username: this.userCred.Username, Password: this.userCred.Password };
		//const authenticationDetails = new AWS.CognitoIdentityServiceProvider.AuthenticationDetails(authenticationData);
		const authenticationDetails = new CognitoSDK.AuthenticationDetails(authenticationData);

		const res = await this.asyncAuthenticateUser(cognitoUser, authenticationDetails);
		return (res);
	}

	async login() {
		try {

			if (!this.userCred.IdToken || !this.userCred.RefreshToken || !this.userCred.AccessToken) {
				await this.getAWSCredentials();
			}

		} catch (e) {
			return (e);
		}
	}

	asyncAuthenticateUser(cognitoUser, cognitoAuthenticationDetails) {

		return new Promise(function (resolve, reject) {
			cognitoUser.authenticateUser(cognitoAuthenticationDetails, {
				onSuccess: function (result) {
					this.userCred.AccessToken = result.accessToken.jwtToken;
					this.userCred.IdToken = result.idToken.jwtToken;
					this.userCred.RefreshToken = result.refreshToken.token;

					this._storeUserCredentialstoFile();

					resolve(true);
					//console.log(userCred);
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

	_storeUserCredentialstoFile(credentials) {

		if (credentials.AccessToken) this.userCred.AccessToken = credentials.AccessToken;
		if (credentials.IdToken) this.userCred.IdToken = credentials.IdToken;
		if (credentials.ExpiresIn) this.userCred.ExpiresIn = credentials.ExpiresIn;
		const jsonData = JSON.stringify(this.userCred);
		fs.writeFileSync(this.userCred.tokenStorageFile, jsonData);
	}

	getUserCredentialsfromFile() {
		const userCred = {};

		const f = fs.readFileSync("keys.json", "utf8");
		const data = JSON.parse(f);
		userCred.Username = data.Username;
		userCred.Password = data.Password;
		userCred.ClientId = CLIENT_ID;
		userCred.UserPoolId = USER_POOL;

		if (data.RefreshToken) userCred.RefreshToken = data.RefreshToken;
		if (data.IdToken) userCred.IdToken = data.IdToken;
		if (data.AccessToken) userCred.AccessToken = data.AccessToken;
		// if (data.ClientId) userCred.ClientId = data.ClientId;
		// if (data.UserPoolId) userCred.UserPoolId = data.UserPoolId;
		if (data.UserRegion) userCred.UserRegion = data.UserRegion;
		if (data.tokenStorageFile) userCred.tokenStorageFile = data.tokenStorageFile;

		return (userCred);
	}

	async getNewTokens() {
		const url = `https://cognito-idp.${this.userCred.UserRegion}.amazonaws.com/`;
		const params = {
			headers: {
				"X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
				"Content-Type": "application/x-amz-json-1.1"
			},
			method: "POST",
			body: JSON.stringify({
				"ClientId": "4qte47jbstod8apnfic0bunmrq",
				"AuthFlow": "REFRESH_TOKEN_AUTH",
				"AuthParameters": {
					"REFRESH_TOKEN": this.userCred.RefreshToken,
					"SECRET_HASH": this.userCred.UserPoolId
				}
			}
			)
		};
		return new Promise(function (resolve, reject) {
			request(url, params, function (error, response, body) {
				let data;
				if (!error) {
					data = JSON.parse(body);

					resolve([response.statusCode, data]);
				} else {
					reject([response.statusCode, data]);
				}
			});
		});

	}

	async getEmpDeviceListUsage() {

		let [status, data] = await this.getAWSDeviceListUsage({});


		if (status === 401) {           // token expired
			[status, data] = await this.getNewTokens();
			this._storeUserCredentialstoFile(data.AuthenticationResult);
			[status, data] = await this.getAWSDeviceListUsage();
			if (status === 200) {
				this._devices.usage = data;
				return (true);
			} else {
				return (false);
			}
		} else {
			this._devices.usage = saveDeviceUsages(data);
			return (true);
		}

		function saveDeviceUsages(devices) {
			const devicesUsage = [];
			devices.forEach(device => {
				devicesUsage.push(device);
				device.channelUsages.forEach(channelUsage => {
					channelUsage.usageKW = channelUsage.usage * 3600 / 1;
				});
			});
			return devicesUsage;
		}
	}
	async getAWSDeviceListUsage({instant = moment.utc().format(), scale = Scale.SECOND, unit = Unit.KWH }) {
		//let deviceGids = this._devices.deviceGids.join("+");
		const deviceGids = this._devices.list.map(d => d.deviceGid).join("+");

		if (!instant) {
			instant = moment.utc().format();
		}

		const url = `https://api.emporiaenergy.com/AppAPI?apiMethod=getDeviceListUsages&deviceGids=${deviceGids}&instant=${instant}&scale=${scale}&energyUnit=${unit}`;

		const params = {
			headers: {
				authtoken: this.userCred.IdToken
			},
			method: "GET",
		};
		//this._devices.usage.splice(0, this._devices.usage.length);
		return  new Promise(function (resolve, reject) {
			//let self1 = self;
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

	async getEmpCustomer() {
		try {
			let [status, data] = await this.getAWSCustomer();

			if (status === 401) {           // token expired
				[status, data] = await this.getNewTokens();
				this._storeUserCredentialstoFile(data.AuthenticationResult);
				[status, data] = await this.getAWSCustomer();
				if (status === 200) {
					this._customer = data;
					return (true);
				} else {
					return (false);
				}
			} else {
				this._customer = data;
				return (true);
			}
		} catch (err) {
			console.log(err);
		}
	}

	async getAWSCustomer() {

		try {
			const url = `https://api.emporiaenergy.com/customers?email=c.menard%40cuas.at`;
			const params = {
				headers: {
					authtoken: this.userCred.IdToken
				},
				// url:url,
				// hostname:"https://api.emporiaenergy.com",
				// path:"/customers?email=c.menard%40cuas.at",
				method: "GET",

			};
			return new Promise((resolve, reject) => {
				request(url, params, (error, response, body) => {
					console.log(response);
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
		const [status, data] = await this.getAWSDevices();

		if (status === 200) {
			this._devices.list = data;
			return true;
		} else {
			return false;
		}
	}
	async getAWSDevices() {
		try {
			const url = `https://api.emporiaenergy.com/customers/devices`;
			const params = {
				headers: {
					authtoken: this.userCred.IdToken
				},
				method: "GET",
			};

			return new Promise((resolve, reject) => {
				request(url, params, (error, response, body) => {
					if (!error) {
						const data = JSON.parse(body);
						resolve([response.statusCode,data.devices]);
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

}


// const _EmVue = EmVue;
module.exports = EmVue;
