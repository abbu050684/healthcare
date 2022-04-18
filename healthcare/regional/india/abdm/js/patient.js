frappe.ui.form.on('Patient', {
	refresh: function (frm) {
		if (frappe.boot.sysdefaults.country == 'India') {
			unhide_field(['abha_number', 'phr_address']);
			if (!frm.doc.phr_address && !frm.doc.abha_number) {
				frm.add_custom_button(__('Search By PHR Adress'), function () {
					search_by_phr_address(frm)
				});
			}
			if (frm.doc.abha_number) {
				frm.add_custom_button(__('Verify ABHA Number'), function () {
					verify_health_id(frm)
				});
			}
			if (!(frm.doc.phr_address || frm.doc.abha_number)) {
				frm.add_custom_button(__('Create ABHA'), function () {
					create_abha(frm)
				}).addClass("btn-primary");
			}
		} else {
			hide_field(['abha_number', 'phr_address']);
		}
	}
});

// search by PHR address, if ABHA number know can be verified
let search_by_phr_address = function (frm) {
	let dialog = new frappe.ui.Dialog({
		title: 'Enter PHR Address',
		fields: [
			{
				label: 'PHR Address',
				fieldname: 'phr_address',
				fieldtype: 'Data',
			},
			{
				label: 'ABHA Number',
				fieldname: 'abha_number',
				fieldtype: 'Data',
			},
			{
				fieldname: 'response_message',
				fieldtype: 'HTML',
				read_only: 1
			}
		],
		primary_action_label: 'Search',
		primary_action(values) {
			if (!dialog.get_value('phr_address')) {
				frappe.throw({
					message: __(`PHR Address is required to search`),
					title: __("ConsPHR Addressent Required")
				});
			} else {
				show_message(dialog, 'Searching...', 'black', '')
				frappe.call({
					method: 'healthcare.regional.india.abdm.utils.abdm_request',
					args: {
						'payload': {
							"healthId": dialog.get_value('phr_address')
						},
						'url_key': 'verify_health_id',
						'req_type': 'Health ID'
					},
					freeze: true,
					freeze_message: __('<br><br>Searching...'),
					callback: function (data) {
						if (data.message['healthIdNumber']) {
							show_message(dialog, 'Status:' + data.message['status'], 'black', '')
							dialog.set_values ({
								'abha_number': data.message['healthIdNumber']
							})
						} else {
							show_message(dialog, data.message.message, 'red',
											data.message.details[0]['message'])
							}
					}
				});
				// dialog.hide();
			}
		},
		secondary_action_label: 'Verify',
		secondary_action(values) {
			dialog.hide();
			if (dialog.get_value('abha_number')) {
				verify_health_id(frm, dialog.get_value('abha_number'))
			}
		}
	});
	dialog.get_secondary_btn().attr('disabled', true);
	dialog.fields_dict['abha_number'].df.onchange = () => {
		if (dialog.get_value('abha_number')) {
			dialog.get_secondary_btn().attr('disabled', false);
		} else {
			dialog.get_secondary_btn().attr('disabled', true);
		}
	}

	dialog.get_primary_btn().attr('disabled', true);
	dialog.fields_dict['phr_address'].df.onchange = () => {
		if (dialog.get_value('phr_address')) {
			dialog.get_primary_btn().attr('disabled', false);
		} else {
			dialog.get_primary_btn().attr('disabled', true);
		}
	}
	dialog.show();
}


let verify_health_id = function (frm, recieved_abha_number = '') {
	let d = new frappe.ui.Dialog({
		title: 'Verify ABHA',
		fields: [
			{
				label: 'ABHA Number',
				fieldname: 'healthid',
				fieldtype: 'Data'
			},
			{
				label: 'Authentication Method',
				fieldname: 'auth_method',
				fieldtype: 'Select',
				options: ['AADHAAR_OTP', 'MOBILE_OTP'],
				default: 'AADHAAR_OTP'
			},
			{
				label: 'Mobile Number To Link',
				fieldname: 'sb1',
				fieldtype: 'Section Break',
				collapsible: 1
			},
			{
				label: 'Mobile',
				fieldname: 'mobile',
				fieldtype: 'Data',
			},
			{
				fieldname: 'sb2',
				fieldtype: 'Section Break'
			},
			{
				fieldname: 'qr_data',
				fieldtype: 'HTML'
			},
			{
				fieldname: 'scanned_data',
				fieldtype: 'Small Text',
				hidden: 1
			},
			{
				fieldname: 'response_message',
				fieldtype: 'HTML',
				read_only: 1
			}
		],
		primary_action_label: 'Send OTP',
		primary_action(values) {
			d.get_primary_btn().attr('disabled', true);
			$(d.fields_dict['response_message'].wrapper).empty();
			frappe.run_serially([
				() =>frappe.db.get_value('Patient', {abha_number: d.get_value('healthid'), name: ['!=', frm.doc.name]	}, 'name')
					.then(r =>{
						if (r.message.name) {
							frappe.set_route("Form", "Patient", r.message.name);
							frappe.throw({
								message: __(`Patient with ABHA number <b>${d.get_value('healthid')}</b> already exists {0}`,
								['<a href="/app/patient/'+r.message.name+'">' + r.message.name + '</a>']),
								title: __("Patient already exist")
							});
						}
					}),
				() => {show_message(d, 'Sending Auth OTP...', 'black', '')
					frappe.call({
						method: 'healthcare.regional.india.abdm.utils.abdm_request',
						args: {
							'payload': {
								"authMethod": d.get_value('auth_method'),
								"healthid": d.get_value('healthid')
							},
							'url_key': 'auth_init',
							'req_type': 'Health ID'
						},
						freeze: true,
						freeze_message: __('Generating OTP...'),
						callback: function (r) {
							let txn_id = r.message['txnId'];
							if (txn_id) {
								show_message(d, 'Successfully Sent OTP', 'green', '')
								verify_auth_otp(r, d)
							} else {
								if (r.message.message && r.message.details[0]['message']) {
									show_message(d, r.message.message, 'red', r.message.details[0]['message'])
								}
								frappe.show_alert({
									message:__('OTP Generation Failed, Please try again later'),
									indicator:'red'
								}, 10);
								d.get_primary_btn().attr('disabled', false);
							}
						}
					});
				}
		])
		},
		secondary_action_label: 'Save',
		secondary_action(values) {
			// save data from qr_scan/api fetch, save to form
			var scanned_data = JSON.parse(d.get_value('scanned_data'));
			set_data_to_form(frm, scanned_data, d.get_value('mobile'))
			frm.save();
			d.hide();
		}
	});

	// QR scanner field
	setup_qr_scanner(d)
	setup_send_otp_btn(d)
	if (recieved_abha_number) {
		d.set_values({
			'healthid': recieved_abha_number
		});
	}
	d.get_secondary_btn().attr('disabled', true);
	d.fields_dict['scanned_data'].df.onchange = () => {
		if (d.get_value('scanned_data')) {
			d.get_secondary_btn().attr('disabled', false);
		}
	}
	d.fields_dict['healthid'].df.onchange = () => {
		d.get_primary_btn().attr('disabled', false);
	}

	d.show();
}

// authorization otp verification
let verify_auth_otp = function(r, d) {
	let dialog = new frappe.ui.Dialog({
		title: 'Authentication OTP',
		fields: [
			{
				label: 'OTP',
				fieldname: 'otp',
				fieldtype: 'Data',
				reqd: 1
			}
		],
		primary_action_label: 'Verify',
		primary_action(values) {
			// sending otp received to call 2 apis and receive health_data
			frappe.call({
				method: 'healthcare.regional.india.abdm.utils.get_health_data',
				args: {
					'otp': dialog.get_value('otp'),
					'txnId': r.message['txnId'],
					'auth_method': d.get_value('auth_method')
				},
				freeze: true,
				freeze_message: __(`<br><br>Verifying OTP... <br>
					<small>Please note, this may take a while</small>`),
				callback: function (data) {
					if (data.message && data.message['healthIdNumber']) {
						d.get_primary_btn().attr('hidden', true);
						set_qr_scanned_data(d, data.message)
						d.set_values({
							'scanned_data': JSON.stringify(data.message)
						});
					} else {
						if (data.message && data.message.details[0]['message']) {
							show_message(d, data.message.message, 'red', data.message.details[0]['message'])
						}
						frappe.show_alert({
							message:__('Failed to fetch health Data, Please try again later'),
							indicator:'red'
						}, 10);
					}
				}
			});
			dialog.hide();
		}
	});
	dialog.show();
}


let create_abha = function (frm) {
	let d = new frappe.ui.Dialog({
		title: 'Create ABHA',
		fields: [
			{
				label: 'Enter Aadhaar',
				fieldname: 'aadhaar',
				fieldtype: 'Data',
				mandatory: 1
			},
			{
				label: 'Received Consent',
				fieldname: 'received_consent',
				fieldtype: 'Check',
				default: 0,
				description: `Received patient consent to
					use Aadhaar for ABHA registration`

			},
		],
		primary_action_label: 'Send OTP',
		primary_action(values) {
			if (!d.get_value('received_consent')) {
				frappe.throw({
					message: __(`Patient Consent is required for ABHA creation`),
					title: __("Consent Required")
				});
			} else {
				create_abha_with_aadhaar(frm, d)
				d.hide();
			}
		}
	});
	d.show();
}


// to create html table
let set_qr_scanned_data = function(d, scanned_data) {
	let wrapper = $(d.fields_dict['qr_data'].wrapper).empty();
	let qr_table = $(`<table class="table table-bordered" style="cursor:pointer; margin:0px;">
		<tbody></tbody</table>`).appendTo(wrapper);
		const row =
			$(`<tr>
				<td>Name</td>
				<td>${scanned_data['name']}</td>
			</tr>
			<tr>
				<td>Gender</td>
				<td>${scanned_data['gender'] || '-'}</td>
			</tr>
			<tr>
				<td>Mobile</td>
				<td>${scanned_data['mobile'] ||  '-'}</td>
			</tr>
			<tr>
				<td>DOB</td>
				<td>${scanned_data['dayOfBirth'] || '-'}/
					${scanned_data['monthOfBirth'] || '-'}/
					${scanned_data['yearOfBirth'] || '-'}</td>
			</tr>
			<tr>
				<td>PHR ID</td>
				<td>${scanned_data['healthId'] || scanned_data['hid'] || '-'}</td>
			</tr>`);
			qr_table.find('tbody').append(row);
}


let set_data_to_form = function(frm, scanned_data, mobile) {
	if (scanned_data) {
		var dob = `${scanned_data['dayOfBirth'] ? scanned_data['dayOfBirth'] : '01'}-
					${scanned_data['monthOfBirth'] ? scanned_data['monthOfBirth'] : '01'}-
					${scanned_data['yearOfBirth']}`
		for (var k in scanned_data) {
			if (k == 'hid' || k == 'healthId'){frm.set_value('phr_address', scanned_data[k])}
			if (k == 'hidn' || k == 'healthIdNumber'){frm.set_value('abha_number', scanned_data[k])}
			if (!frm.doc.first_name) {
				if (k == 'name'){frm.set_value('first_name', scanned_data[k])}
			}
			if (!frm.doc.dob) {
				if (dob){frm.set_value('dob', moment(dob, 'DD/MM/YYYY').format('YYYY-MM-DD'))}
			}
			if (!frm.doc.email) {
				if (k == 'email'){frm.set_value('email', scanned_data[k])}
			}
			if (mobile) {
				frm.set_value('mobile', mobile)
			} else if (k == 'mobile'){
				frm.set_value('mobile', scanned_data[k])
			}
			if (k == 'gender'){
				let gender = scanned_data[k] == 'M' ? 'Male' :
				scanned_data[k] == 'F' ? 'Female' :
				scanned_data[k] == 'U' ? 'Prefer not to say' : 'Other'
				frm.set_value('sex', gender)}
		}
	}
}


let setup_qr_scanner = function(dialog) {
	dialog.fields_dict.healthid.$wrapper.find('.control-input').append(
		`<span class="link-btn" style="display:inline">
			<a class="btn-open no-decoration" title="${__("Scan")}">
				${frappe.utils.icon('scan', 'sm')}
			</a>
		</span>`
	);
	let scan_btn = dialog.$body.find('.link-btn');
	scan_btn.toggle(true);

	scan_btn.on('click', 'a', () => {
		new frappe.ui.Scanner({
			dialog: true,
			multiple: false,
			on_scan(data) {
				if (data && data.result && data.result.text) {
					var scanned_data = JSON.parse(data.decodedText);
					dialog.set_values({
						'scanned_data': data.decodedText,
						'healthid': (scanned_data['hidn'] ? scanned_data['hidn'] : '')
					});
					set_qr_scanned_data(dialog, scanned_data)
				}
			}
		});
	});
}


let show_message = function(dialog, message, color, details) {
	let wrapper = $(dialog.fields_dict['response_message'].wrapper).empty();
	$(`<div style="color:${color}; background-color:#f4f5f6; border-radius:5px;
		padding:5px 5px 5px 5px">${message}<br>
		${details ? 'Details: '+details+'</div>': '</div>'}`).appendTo(wrapper);
}


let setup_search_btn = function(dialog) {
	dialog.fields_dict.username.$wrapper.find('.control-input').append(
		`<span class="link-btn search" style="display:inline">
		<a class="search-icons" title="${__("Search")}">
			${frappe.utils.icon("search", "sm")}
			</a>
		</span>`
	);
	let search_btn = dialog.$body.find('.search');
	search_btn.toggle(true);

	search_btn.on('click', 'a', () => {
		if (dialog.get_value('username')) {
			show_message(dialog, 'Verifying...', 'black', '')
			frappe.call({
				method: 'healthcare.regional.india.abdm.utils.abdm_request',
				args: {
					'payload': {
						"healthId": dialog.get_value('username')
					},
					'url_key': 'exists_by_health_id',
					'req_type': 'Health ID'
				},
				freeze: true,
				freeze_message: __('<br><br>Verifying...'),
				callback: function (data) {
					if (data.message['status'] == false) {
						show_message(dialog, 'PHR Address is unique', 'green', '')
						dialog.get_primary_btn().attr('disabled', false);
					} else if (data.message['status'] == true) {
						show_message(dialog, 'PHR Address is already existing', 'red', '')
						dialog.get_primary_btn().attr('disabled', true);
					}
				}
			});
		}
	});
}


let create_abha_with_aadhaar = function(frm, d) {
	let txn_id = ''
	let error_msg = ''
	frappe.run_serially([
		() => frappe.call({
				method: 'healthcare.regional.india.abdm.utils.abdm_request',
				args: {
					'payload': {
						"aadhaar": d.get_value('aadhaar')
					},
					'url_key': 'generate_aadhaar_otp',
					'req_type': 'Health ID'
				},
				freeze: true,
				freeze_message: __('Sending OTP...'),
				callback: function (r) {
					if (r.message['txnId']) {
						txn_id = r.message['txnId'];
					} else {
						error_msg = r.message
					}
				}
			}),
		() => {
			if (txn_id) {
				let dialog = new frappe.ui.Dialog({
					title: 'Create',
					fields: [
					{
						label: 'Aadhaar OTP',
						fieldname: 'otp',
						fieldtype: 'Data',
						reqd: 1
					},
					{
						fieldname: 'resent_txn_id',
						fieldtype: 'Data',
						hidden: 1
					},
					{
						label: 'Use Another Mobile Number For ABHA',
						fieldname: 'sb1',
						fieldtype: 'Section Break',
						collapsible: 1
					},
					{
						label: 'Mobile',
						fieldname: 'mobile',
						fieldtype: 'Data',
					},
					{
						fieldname: 'sb2',
						fieldtype: 'Section Break'
					},
					{
						label: 'Suggest PHR Address',
						fieldname: 'sb5',
						fieldtype: 'Section Break',
						collapsible: 1
					},
					{
						label: 'Choose PHR Address (Optional)',
						fieldname: 'username',
						fieldtype: 'Data'
					},
					{
						fieldname: 'sb3',
						fieldtype: 'Section Break',
						hide_border: 1
					},
					{
						fieldname: 'response_message',
						fieldtype: 'HTML',
						read_only: 1
					}
					],
					primary_action_label: 'Create ABHA ID',
					primary_action(values) {
						dialog.get_primary_btn().attr('disabled', true);
						frappe.call({
							method: 'healthcare.regional.india.abdm.utils.abdm_request',
							args: {
								'payload': {
									"email": frm.doc.email || '',
									"firstName": frm.doc.first_name || '',
									"lastName": frm.doc.last_name || '',
									"middleName": frm.doc.middle_name || '',
									"mobile": dialog.get_value('mobile') ?
										dialog.get_value('mobile') : frm.doc.mobile,
									"otp": dialog.get_value('otp'),
									"password": dialog.get_value('password'),
									"txnId": txn_id,
									"username": dialog.get_value('username')
								},
								'url_key': 'create_abha_w_aadhaar',
								'req_type': 'Health ID'
							},
							freeze: true,
							freeze_message: __(`<br><br><br>Creating Health ID <br>
								<small>Please note, this may take a while</small>`),
							callback: function (data) {
								if (data.message['healthIdNumber']) {
									dialog.hide()
									frappe.run_serially([
										() =>frappe.db.get_value('Patient', {abha_number: data.message['healthIdNumber'],
												name: ['!=', frm.doc.name]	}, 'name')
											.then(r =>{
												if (r.message.name) {
													frappe.set_route("Form", "Patient", r.message.name);
													frappe.throw({
														message: __(`Patient with ABHA number
															<b>${data.message['healthIdNumber']}</b> already exists {0}`,
															['<a href="/app/patient/'+r.message.name+'">' + r.message.name + '</a>']),
														title: __("Patient already exist")
													});
												}
											}),
										() => {
											set_data_to_form(frm, data.message, dialog.get_value('mobile'))
											if (data.message['new'] == false) {
												frappe.show_alert({
													message: __('Fetched existing ABHA of aadhaar provided'),
													indicator: 'green' }, 5);
											} else {
												frappe.show_alert({
													message: __('ABHA ID created successfully'),
													indicator: 'green' }, 5);
											}
											frm.save()
											dialog.hide();
										}
									])
								} else {
									dialog.get_primary_btn().attr('disabled', false);
									if (data.message && data.message.details[0]['message']) {
										show_message(dialog, data.message.message, 'red',
										data.message.details[0]['message'])
									}
									frappe.show_alert({
										message: __('ABHA ID not Created'),
										indicator: 'red' }, 5);
								}
							}
						});
					}
				});

				setup_search_btn(dialog)
				setup_resend_otp_btn(dialog, txn_id)
				setup_send_otp_btn(dialog, txn_id)

				// clear response_message
				dialog.fields_dict['username'].df.onchange = () => {
					$(dialog.fields_dict['response_message'].wrapper).empty();
					dialog.get_primary_btn().attr('disabled', true);
				}
				dialog.show();
			} else {
				if (error_msg) {
					if (error_msg.details[0]['message']) {
						frappe.show_alert({
							message: __(error_msg.details[0]['message']),
							indicator: 'red' }, 5);
					} else if (error_msg.message) {
						frappe.show_alert({
							message: __(error_msg.message),
							indicator: 'red' }, 5);
					}
				}
			}
		}
	]);

}


let setup_resend_otp_btn = function(dialog, txn_id) {
	dialog.fields_dict.otp.$wrapper.find('.control-input').append(
		`<span class="link-btn resend-btn" style="display:inline">
		<a class="icons" title="${__("Resend OTP")}">
			Resend OTP
			</a>
		</span>`
	);
	let search_btn = dialog.$body.find('.resend-btn');
	search_btn.toggle(true);

	search_btn.on('click', 'a', () => {
		if (txn_id) {
			show_message(dialog, 'Resending Aadhaar OTP ...', 'black', '')
			frappe.call({
				method: 'healthcare.regional.india.abdm.utils.abdm_request',
				args: {
					'payload': {
						"txnId": txn_id
					},
					'url_key': 'resend_aadhaar_otp',
					'req_type': 'Health ID'
				},
				freeze: true,
				freeze_message: __('<br><br>Resending Aadhaar OTP...'),
				callback: function (data) {
					if (data.message['txnId']) {
						show_message(dialog, 'Successfully Resent Aadhaar OTP', 'green', '')
						dialog.get_primary_btn().attr('disabled', false);
						dialog.set_values({
							'resent_txn_id': data.message['txnId']
						});
					} else {
						show_message(dialog, 'Resending Aadhaar OTP Failed', 'red', '')
						dialog.get_primary_btn().attr('disabled', true);
					}
				}
			});
		}
	});
}


let setup_send_otp_btn = function(dialog, txn_id = '') {
	dialog.fields_dict.mobile.$wrapper.find('.control-input').append(
		`<span class="link-btn send-a-m-otp" style="display:inline">
		<a class="icons" title="${__("Search")}">
			Verify
			</a>
		</span>`
	);
	let search_btn = dialog.$body.find('.send-a-m-otp');
	search_btn.toggle(true);

	search_btn.on('click', 'a', () => {
		if (dialog.get_value('mobile')) {
			let args = {};
			let url_key = '';
			if (txn_id) {
				args =  {
					'payload': {
						"mobile": dialog.get_value('mobile'),
						"txnId": txn_id
					},
					'url_key': 'generate_aadhaar_mobile_otp',
					'req_type': 'Health ID'
				}
				url_key = 'verify_aadhaar_mobile_otp'
			} else {
				args =  {
					'payload': {
						"mobile": dialog.get_value('mobile')
					},
					'url_key': 'generate_mobile_otp_for_linking',
					'req_type': 'Health ID'
				}
				url_key = 'verify_mobile_otp_for_linking'
			}
			dialog.fields_dict.mobile.$wrapper.find("span").remove();
			show_message(dialog, 'Sending Mobile OTP...', 'black', '')
			frappe.call({
				method: 'healthcare.regional.india.abdm.utils.abdm_request',
				args: args,
				freeze: true,
				freeze_message: __('<br><br>Verifying...'),
				callback: function (data) {
					if (data.message['txnId']) {
						// setup_verify_otp_btn(dialog, data.message['txnId'])
						verify_mobile_otp_dialog(dialog, data.message['txnId'], url_key)
						show_message(dialog, 'Successfully Sent OTP', 'green', '')
					} else {
						// recreate send otp btn if otp sending fails
						setup_send_otp_btn(dialog, txn_id)
						if (data.message && data.message.details[0]['message']) {
							show_message(dialog, data.message.message, 'red',
								data.message.details[0]['message'])
						} else {
							show_message(dialog, 'Sending OTP Failed', 'red', '')
						}
					}
				}
			});
		} else {
			show_message(dialog, 'Please Enter Mobile Number', 'red', '')
		}
	});
}


let verify_mobile_otp_dialog = function(dialog, txn_id, url_key) {
	let otp_dialog = new frappe.ui.Dialog({
		title: 'Mobile Verification',
		fields: [
			{
				label: 'OTP',
				fieldname: 'otp',
				fieldtype: 'Data',
				reqd: 1
			}
		],
		primary_action_label: 'Verify',
		primary_action(values) {
			show_message(dialog, 'Verifying OTP...', 'black', '')
			let args = {};
			if (url_key == 'verify_aadhaar_mobile_otp') {
				args =  {
					'payload': {
						"otp": otp_dialog.get_value('otp'),
						"txnId": txn_id
					},
					'url_key': url_key,
					'req_type': 'Health ID'
				}
			} else if (url_key == 'verify_mobile_otp_for_linking'){
				args =  {
					'payload': {
						"to_encrypt": otp_dialog.get_value('otp'),
						"txnId": txn_id
					},
					'url_key': url_key,
					'req_type': 'Health ID',
					'to_be_enc': 'otp'
				}
			}
			frappe.call({
				method: 'healthcare.regional.india.abdm.utils.abdm_request',
				args: args,
				freeze: true,
				freeze_message: __('<br><br>Verifying...'),
				callback: function (data) {
					$(dialog.fields_dict['response_message'].wrapper).empty();
					if (data.message['txnId'] || data.message['token']) {
						dialog.fields_dict.mobile.$wrapper.find("span").remove();
						dialog.fields_dict.mobile.$wrapper.find('.control-input').append(
							`<span class="link-btn" style="display:inline">
								<a class="icons" title="${__("Verified")}">
									<i class="fa fa-check" aria-hidden="true"></i>
								</a>
							</span>`
						);
					} else {
						dialog.fields_dict.mobile.$wrapper.find("span").remove();
						dialog.fields_dict.mobile.$wrapper.find('.control-input').append(
							`<span class="link-btn p-x-btn" style="display:inline">
								<a class="icons" title="${__("Verification Failed")}">
									<i class="fa fa-times" aria-hidden="true"></i>
								</a>
							</span>`
						);
						let x_btn = dialog.$body.find('.p-x-btn');
						x_btn.toggle(true);

						x_btn.on('click', 'a', () => {
							dialog.fields_dict.mobile.$wrapper.find("span").remove();
							if (url_key == 'verify_aadhaar_mobile_otp') {
								setup_send_otp_btn(dialog, txn_id)
							} else if (url_key == 'verify_mobile_otp_for_linking'){
								setup_send_otp_btn(dialog)
							}
						});
					}
				}
			});
			otp_dialog.hide();
		}
	});
	otp_dialog.show();
}