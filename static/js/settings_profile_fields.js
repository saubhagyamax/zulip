import $ from "jquery";
import {Sortable} from "sortablejs";

import render_confirm_delete_profile_field_option from "../templates/confirm_dialog/confirm_delete_profile_field_option.hbs";
import render_add_new_custom_profile_field_form from "../templates/settings/add_new_custom_profile_field_form.hbs";
import render_admin_profile_field_list from "../templates/settings/admin_profile_field_list.hbs";
import render_edit_custom_profile_field_form from "../templates/settings/edit_custom_profile_field_form.hbs";
import render_settings_profile_field_choice from "../templates/settings/profile_field_choice.hbs";

import * as channel from "./channel";
import * as confirm_dialog from "./confirm_dialog";
import * as dialog_widget from "./dialog_widget";
import {$t_html} from "./i18n";
import * as loading from "./loading";
import {page_params} from "./page_params";
import * as people from "./people";
import * as settings_ui from "./settings_ui";

const meta = {
    loaded: false,
};

export function maybe_disable_widgets() {
    if (page_params.is_admin) {
        return;
    }

    $(".organization-box [data-name='profile-field-settings']")
        .find("input, button, select")
        .prop("disabled", true);
}

let order = [];
const field_types = page_params.custom_profile_field_types;

export function field_type_id_to_string(type_id) {
    for (const field_type of Object.values(field_types)) {
        if (field_type.id === type_id) {
            // Few necessary modifications in field-type-name for
            // table-list view of custom fields UI in org settings
            if (field_type.name === "Date picker") {
                return "Date";
            } else if (field_type.name === "Person picker") {
                return "Person";
            }
            return field_type.name;
        }
    }
    return undefined;
}

function update_profile_fields_table_element() {
    const $profile_fields_table = $("#admin_profile_fields_table").expectOne();

    // If there are no custom fields, hide the table headers at the top
    if (page_params.custom_profile_fields.length < 1) {
        $profile_fields_table.hide();
    } else {
        $profile_fields_table.show();
    }
}

function delete_profile_field(e) {
    e.preventDefault();
    e.stopPropagation();

    settings_ui.do_settings_change(
        channel.del,
        "/json/realm/profile_fields/" + encodeURIComponent($(this).attr("data-profile-field-id")),
        {},
        $("#admin-profile-field-status").expectOne(),
    );
    update_profile_fields_table_element();
}

function read_select_field_data_from_form($profile_field_form, old_field_data) {
    const field_data = {};
    let field_order = 1;

    const old_option_value_map = new Map();
    if (old_field_data !== undefined) {
        for (const [value, choice] of Object.entries(old_field_data)) {
            old_option_value_map.set(choice.text, value);
        }
    }

    $profile_field_form.find("div.choice-row").each(function () {
        const text = $(this).find("input")[0].value;
        if (text) {
            if (old_option_value_map.get(text) !== undefined) {
                // Resetting the data-value in the form is
                // important if the user removed an option string
                // and then added it back again before saving
                // changes.
                $(this).attr("data-value", old_option_value_map.get(text));
            }
            const value = $(this).attr("data-value");
            field_data[value] = {text, order: field_order.toString()};
            field_order += 1;
        }
    });

    return field_data;
}

function read_external_account_field_data($profile_field_form) {
    const field_data = {};
    field_data.subtype = $profile_field_form.find("select[name=external_acc_field_type]").val();
    if (field_data.subtype === "custom") {
        field_data.url_pattern = $profile_field_form.find("input[name=url_pattern]").val();
    }
    return field_data;
}

function update_choice_delete_btn($container, display_flag) {
    const no_of_choice_row = $container.find(".choice-row").length;

    // Disable delete button if there only one choice row
    // Enable choice delete button more one than once choice
    if (no_of_choice_row === 1) {
        if (display_flag === true) {
            $container.find(".choice-row .delete-choice").show();
        } else {
            $container.find(".choice-row .delete-choice").hide();
        }
    }
}

function get_value_for_new_option(container) {
    const $choice_rows = $(container).find(".choice-row");
    if ($choice_rows.length === 0) {
        // Value for the first option is 0.
        return 0;
    }

    const existing_option_values = [];
    $choice_rows.each(function () {
        existing_option_values.push(Number.parseInt($(this).attr("data-value"), 10));
    });
    existing_option_values.sort();
    return existing_option_values[existing_option_values.length - 1] + 1;
}

function create_choice_row(container) {
    const context = {value: get_value_for_new_option(container)};
    const row = render_settings_profile_field_choice(context);
    $(container).append(row);
}

function clear_form_data() {
    $("#profile_field_name").val("").closest(".input-group").show();
    $("#profile_field_hint").val("").closest(".input-group").show();
    // Set default type "Short text" in field type dropdown
    $("#profile_field_type").val(field_types.SHORT_TEXT.id);
    // Clear data from select field form
    $("#profile_field_choices").empty();
    create_choice_row($("#profile_field_choices"));
    update_choice_delete_btn($("#profile_field_choices"), false);
    $("#profile_field_choices_row").hide();
    // Clear external account field form
    $("#custom_field_url_pattern").val("");
    $("#custom_external_account_url_pattern").hide();
    $("#profile_field_external_accounts").hide();
    $("#profile_field_external_accounts_type").val(
        $("#profile_field_external_accounts_type option:first-child").val(),
    );
}

function set_up_create_field_form() {
    // Hide error on field type change.
    $("#dialog_error").hide();
    const $field_elem = $("#profile_field_external_accounts");
    const $field_url_pattern_elem = $("#custom_external_account_url_pattern");

    if (Number.parseInt($("#profile_field_type").val(), 10) === field_types.EXTERNAL_ACCOUNT.id) {
        $field_elem.show();
        const $profile_field_external_account_type = $(
            "#profile_field_external_accounts_type",
        ).val();
        if ($profile_field_external_account_type === "custom") {
            $field_url_pattern_elem.show();
            $("#profile_field_name").val("").prop("disabled", false);
            $("#profile_field_hint").val("").prop("disabled", false);
        } else {
            $field_url_pattern_elem.hide();
            const profile_field_name =
                page_params.realm_default_external_accounts[$profile_field_external_account_type]
                    .name;
            $("#profile_field_name").val(profile_field_name).prop("disabled", true);
            $("#profile_field_hint").val("").prop("disabled", true);
        }
    } else {
        $("#profile_field_name").prop("disabled", false);
        $("#profile_field_hint").prop("disabled", false);
        $field_url_pattern_elem.hide();
        $field_elem.hide();
    }
}

function read_field_data_from_form(field_type_id, $profile_field_form, old_field_data) {
    // Only read field data if we are creating a select field
    // or external account field.
    if (field_type_id === field_types.SELECT.id) {
        return read_select_field_data_from_form($profile_field_form, old_field_data);
    } else if (field_type_id === field_types.EXTERNAL_ACCOUNT.id) {
        return read_external_account_field_data($profile_field_form);
    }
    return undefined;
}

function open_custom_profile_field_form_modal() {
    const html_body = render_add_new_custom_profile_field_form({
        realm_default_external_accounts: page_params.realm_default_external_accounts,
        custom_profile_field_types: page_params.custom_profile_field_types,
    });

    function create_profile_field() {
        let field_data = {};
        const field_type = $("#profile_field_type").val();
        field_data = read_field_data_from_form(
            Number.parseInt(field_type, 10),
            $(".new-profile-field-form"),
        );
        const data = {
            name: $("#profile_field_name").val(),
            hint: $("#profile_field_hint").val(),
            field_type,
            field_data: JSON.stringify(field_data),
        };
        const url = "/json/realm/profile_fields";
        dialog_widget.submit_api_request(channel.post, url, data);
    }

    function set_up_form_fields() {
        set_up_select_field();
        set_up_external_account_field();
        clear_form_data();
    }

    dialog_widget.launch({
        form_id: "add-new-custom-profile-field-form",
        help_link: "/help/add-custom-profile-fields",
        html_heading: $t_html({defaultMessage: "Add a new custom profile field"}),
        html_body,
        html_submit_button: $t_html({defaultMessage: "Add"}),
        on_click: create_profile_field,
        post_render: set_up_form_fields,
        loading_spinner: true,
    });
}

function add_choice_row(e) {
    if ($(e.target).parent().next().hasClass("choice-row")) {
        return;
    }
    const choices_div = e.delegateTarget;
    update_choice_delete_btn($(choices_div), true);
    create_choice_row(choices_div);
}

function delete_choice_row(e) {
    const $row = $(e.currentTarget).parent();
    const $container = $row.parent();
    $row.remove();
    update_choice_delete_btn($container, false);
}

function show_modal_for_deleting_options(field, deleted_values, update_profile_field) {
    const active_user_ids = people.get_active_user_ids();
    let users_count_with_deleted_option_selected = 0;
    for (const user_id of active_user_ids) {
        const field_value = people.get_custom_profile_data(user_id, field.id);
        if (field_value && deleted_values.has(field_value.value)) {
            users_count_with_deleted_option_selected += 1;
        }
    }
    const html_body = render_confirm_delete_profile_field_option({
        count: users_count_with_deleted_option_selected,
        field_name: field.name,
    });

    confirm_dialog.launch({
        html_heading: $t_html({defaultMessage: "Delete option"}),
        html_body,
        on_click: update_profile_field,
    });
}

function get_profile_field(id) {
    return page_params.custom_profile_fields.find((field) => field.id === id);
}

export function parse_field_choices_from_field_data(field_data) {
    const choices = [];
    for (const [value, choice] of Object.entries(field_data)) {
        choices.push({
            value,
            text: choice.text,
            order: choice.order,
        });
    }
    choices.sort((a, b) => a.order - b.order);
    return choices;
}

function set_up_external_account_field_edit_form($profile_field_form, url_pattern_val) {
    if ($profile_field_form.find("select[name=external_acc_field_type]").val() === "custom") {
        $profile_field_form.find("input[name=url_pattern]").val(url_pattern_val);
        $profile_field_form.find(".custom_external_account_detail").show();
        $profile_field_form.find("input[name=name]").prop("disabled", false);
        $profile_field_form.find("input[name=hint]").prop("disabled", false);
    } else {
        $profile_field_form.find("input[name=name]").prop("disabled", true);
        $profile_field_form.find("input[name=hint]").prop("disabled", true);
        $profile_field_form.find(".custom_external_account_detail").hide();
    }
}

function set_up_select_field_edit_form($profile_field_form, field_data) {
    // Re-render field choices in edit form to load initial select data
    const $choice_list = $profile_field_form.find(".edit_profile_field_choices_container");
    $choice_list.off();
    $choice_list.empty();

    const choices_data = parse_field_choices_from_field_data(field_data);

    for (const choice of choices_data) {
        $choice_list.append(
            render_settings_profile_field_choice({
                text: choice.text,
                value: choice.value,
            }),
        );
    }

    // Add blank choice at last
    create_choice_row($choice_list);
    update_choice_delete_btn($choice_list, false);
    Sortable.create($choice_list[0], {
        onUpdate() {},
        filter: "input",
        preventOnFilter: false,
    });
}

function open_edit_form_modal(e) {
    const field_id = Number.parseInt($(e.currentTarget).attr("data-profile-field-id"), 10);
    const field = get_profile_field(field_id);

    let field_data = {};
    if (field.field_data) {
        field_data = JSON.parse(field.field_data);
    }
    let choices = [];
    if (field.type === field_types.SELECT.id) {
        choices = parse_field_choices_from_field_data(field_data);
    }

    const html_body = render_edit_custom_profile_field_form({
        profile_field_info: {
            id: field.id,
            name: field.name,
            hint: field.hint,
            choices,
            is_select_field: field.type === field_types.SELECT.id,
            is_external_account_field: field.type === field_types.EXTERNAL_ACCOUNT.id,
        },
        realm_default_external_accounts: page_params.realm_default_external_accounts,
    });

    function set_initial_values_of_profile_field() {
        const $profile_field_form = $("#edit-custom-profile-field-form-" + field_id);

        if (Number.parseInt(field.type, 10) === field_types.SELECT.id) {
            set_up_select_field_edit_form($profile_field_form, field_data);
        }

        if (Number.parseInt(field.type, 10) === field_types.EXTERNAL_ACCOUNT.id) {
            $profile_field_form
                .find("select[name=external_acc_field_type]")
                .val(field_data.subtype);
            set_up_external_account_field_edit_form($profile_field_form, field_data.url_pattern);
        }

        // Set initial value in edit form
        $profile_field_form.find("input[name=name]").val(field.name);
        $profile_field_form.find("input[name=hint]").val(field.hint);

        $profile_field_form
            .find(".edit_profile_field_choices_container")
            .on("input", ".choice-row input", add_choice_row);
        $profile_field_form
            .find(".edit_profile_field_choices_container")
            .on("click", "button.delete-choice", delete_choice_row);
    }

    function submit_form() {
        const $profile_field_form = $("#edit-custom-profile-field-form-" + field_id);

        // For some reason jQuery's serialize() is not working with
        // channel.patch even though it is supported by $.ajax.
        const data = {};

        data.name = $profile_field_form.find("input[name=name]").val();
        data.hint = $profile_field_form.find("input[name=hint]").val();

        const new_field_data = read_field_data_from_form(
            Number.parseInt(field.type, 10),
            $profile_field_form,
            field_data,
        );
        data.field_data = JSON.stringify(new_field_data);

        function update_profile_field() {
            const url = "/json/realm/profile_fields/" + field_id;
            dialog_widget.submit_api_request(channel.patch, url, data);
        }

        if (field.type === field_types.SELECT.id) {
            const old_values = new Set(Object.keys(field_data));
            const new_values = new Set(Object.keys(new_field_data));
            const deleted_values = new Set(
                [...old_values].filter((value) => !new_values.has(value)),
            );

            if (deleted_values.size !== 0) {
                const edit_select_field_modal_callback = () =>
                    show_modal_for_deleting_options(field, deleted_values, update_profile_field);
                dialog_widget.close_modal(edit_select_field_modal_callback);
                return;
            }
        }

        update_profile_field();
    }

    const edit_custom_profile_field_form_id = "edit-custom-profile-field-form-" + field_id;
    dialog_widget.launch({
        form_id: edit_custom_profile_field_form_id,
        html_heading: $t_html({defaultMessage: "Edit custom profile field"}),
        html_body,
        on_click: submit_form,
        post_render: set_initial_values_of_profile_field,
        loading_spinner: true,
    });
}

export function reset() {
    meta.loaded = false;
}

function update_field_order() {
    order = [];
    $(".profile-field-row").each(function () {
        order.push(Number.parseInt($(this).attr("data-profile-field-id"), 10));
    });
    settings_ui.do_settings_change(
        channel.patch,
        "/json/realm/profile_fields",
        {order: JSON.stringify(order)},
        $("#admin-profile-field-status").expectOne(),
    );
}

export function populate_profile_fields(profile_fields_data) {
    if (!meta.loaded) {
        // If outside callers call us when we're not loaded, just
        // exit and we'll draw the widgets again during set_up().
        return;
    }
    do_populate_profile_fields(profile_fields_data);
}

export function do_populate_profile_fields(profile_fields_data) {
    // We should only call this internally or from tests.
    const $profile_fields_table = $("#admin_profile_fields_table").expectOne();

    $profile_fields_table.find("tr.profile-field-row").remove(); // Clear all rows.
    $profile_fields_table.find("tr.profile-field-form").remove(); // Clear all rows.
    order = [];

    for (const profile_field of profile_fields_data) {
        order.push(profile_field.id);
        let field_data = {};
        if (profile_field.field_data) {
            field_data = JSON.parse(profile_field.field_data);
        }
        let choices = [];
        if (profile_field.type === field_types.SELECT.id) {
            choices = parse_field_choices_from_field_data(field_data);
        }

        $profile_fields_table.append(
            render_admin_profile_field_list({
                profile_field: {
                    id: profile_field.id,
                    name: profile_field.name,
                    hint: profile_field.hint,
                    type: field_type_id_to_string(profile_field.type),
                    choices,
                    is_select_field: profile_field.type === field_types.SELECT.id,
                    is_external_account_field:
                        profile_field.type === field_types.EXTERNAL_ACCOUNT.id,
                },
                can_modify: page_params.is_admin,
                realm_default_external_accounts: page_params.realm_default_external_accounts,
            }),
        );
    }

    if (page_params.is_admin) {
        const field_list = $("#admin_profile_fields_table")[0];
        Sortable.create(field_list, {
            onUpdate: update_field_order,
            filter: "input",
            preventOnFilter: false,
        });
    }

    update_profile_fields_table_element();
    loading.destroy_indicator($("#admin_page_profile_fields_loading_indicator"));
}

function set_up_select_field() {
    create_choice_row("#profile_field_choices");
    update_choice_delete_btn($("#profile_field_choices"), false);

    if (page_params.is_admin) {
        const choice_list = $("#profile_field_choices")[0];
        Sortable.create(choice_list, {
            onUpdate() {},
            filter: "input",
            preventOnFilter: false,
        });
    }

    const field_type = $("#profile_field_type").val();

    if (Number.parseInt(field_type, 10) !== field_types.SELECT.id) {
        // If 'Select' type is already selected, show choice row.
        $("#profile_field_choices_row").hide();
    }

    $("#profile_field_type").on("change", (e) => {
        // Hide error on field type change.
        $("#dialog_error").hide();
        const selected_field_id = Number.parseInt($(e.target).val(), 10);
        if (selected_field_id === field_types.SELECT.id) {
            $("#profile_field_choices_row").show();
        } else {
            $("#profile_field_choices_row").hide();
        }
    });

    $("#profile_field_choices").on("input", ".choice-row input", add_choice_row);
    $("#profile_field_choices").on("click", "button.delete-choice", delete_choice_row);
}

function set_up_external_account_field() {
    $("#profile_field_type").on("change", () => {
        set_up_create_field_form();
    });

    $("#profile_field_external_accounts_type").on("change", () => {
        set_up_create_field_form();
    });
}

export function get_external_account_link(field) {
    const field_subtype = field.field_data.subtype;
    let field_url_pattern;

    if (field_subtype === "custom") {
        field_url_pattern = field.field_data.url_pattern;
    } else {
        field_url_pattern = page_params.realm_default_external_accounts[field_subtype].url_pattern;
    }
    return field_url_pattern.replace("%(username)s", field.value);
}

export function set_up() {
    build_page();
    maybe_disable_widgets();
}

export function build_page() {
    // create loading indicators
    loading.make_indicator($("#admin_page_profile_fields_loading_indicator"));
    // Populate profile_fields table
    do_populate_profile_fields(page_params.custom_profile_fields);
    meta.loaded = true;

    $("#admin_profile_fields_table").on("click", ".delete", delete_profile_field);
    $("#add-custom-profile-field-btn").on("click", open_custom_profile_field_form_modal);
    $("#admin_profile_fields_table").on("click", ".open-edit-form-modal", open_edit_form_modal);
}
