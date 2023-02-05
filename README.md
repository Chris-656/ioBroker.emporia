<img src="admin/emporia.png" width="100">

# ioBroker.emporia

This adapter retrieves data from emporia engergy system. At the moment just retrieval of
- live power consumption
- daily values

no outlets and solar at the moment.

Used the API documentation from [here](https://github.com/magico13/PyEmVue/blob/master/api_docs.md)

## Screen Shots
<img src="admin/img/screenshot1.png" width="400">

<img src="admin/img/screenshot2.png" width="400">


## Changelog
- init user credentials
<!--
  Placeholder for the next version (at the beginning of the line):
  ### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**

### 0.0.8 (2023-02-05)
- changed user credentials

### 0.0.7 (2022-12-15)
- added daily usage for monitoring
- changed state structure

### 0.0.6 (2022-12-07)
- refresh time updated
- possibility to change the output units to kW or Watt
- state for activating or deactivating the retrieval

### 0.0.5 (2022-12-06)
- Updated user credentials and retrieve token if not available
- min or bug fixes

### 0.0.4 (2022-12-05)
- Feat: minor bug fixes

### 0.0.3 (2022-12-05)
 - Maint: Changed User Credentials

### 0.0.2 (2022-12-04)
- initial version