function fmap(val, imin, imax, omin, omax) {
  var norm = (1.0*val - imin) / (imax - imin);
  return omin + norm * (omax - omin);
}

function getParameterByName(name) {
  name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
  var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
      results = regex.exec(location.search);
  return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

$(function() {
  initializeBlockly();
  var socket = io();

  var width = $("#fabric-container").width();
  var height = $("#fabric-container").height();
  var canvas = this.__canvas = new fabric.Canvas('fabric');
  canvas.setWidth(width);
  canvas.setHeight(height);

  fabric.Object.prototype.transparentCorners = false;

  var shapes = {};
  var loaded_shapes_dict = {};
  var canvas_code = "";
  var last_server_pin_map = {};

  var naturals_names = ["left", "top", "scaleX", "scaleY", "angle"];

  var images = [];

  var block_to_pin_conf = {}
  var analog_pins = ["none", "A0", "A1", "A2", "A3"]
  var digital_pins = [
    "none", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9", "D10", "D11", "D12", "D13"
  ];

  var last_pin_state = {};

  setupSaveAndLoad();
  setupUpload();
  fetchImages();


  setInterval(function() {
    try {
      eval(canvas_code);
    } catch (e) {
      console.log(canvas_code);
      console.log(e);
    }
  }, 25);

  socket.on("pin_state", function(pin_state) {
    _.each(pin_state, function(value, pin) {
      if (last_pin_state[pin] != pin_state[pin]) {
        //console.log("pin change", pin, pin_state[pin]);
        _.each(block_to_pin_conf, function(pin_conf, block_id) {
          if (pin_conf.pin == pin) {
            if (pin_conf.mode == "digital") {
              var target_value;
              if (pin_state[pin] == 1) target_value = pin_conf.on_value
              else target_value = pin_conf.off_value;

              if (pin_conf.transition_time == 0) {
                pin_conf.cur_value = target_value;
              } else {
                pin_conf.cur_transition = [(new Date()).getTime(), pin_conf.cur_value, target_value];
                pin_conf.cur_value = fmap(
                  pin_state[pin], 
                  0, 1,
                  pin_conf.off_value, pin_conf.on_value
                );
              }
            } else if (pin_conf.mode == "analog") {
              //console.log(pin_state[pin]);
              pin_conf.cur_value = fmap(pin_state[pin], 0, 1, pin_conf.min_value, pin_conf.max_value);
            }
          }
        });
      }
    });
    last_pin_state = pin_state;
  });

  function applyShapeNaturals(shape) {
    props = {}
    _.each(naturals_names, function(prop) {
      props[prop] = shape["natural_"+prop];
    });
    shape.set(props);
  }

  function updateShapeNaturals(shape) {
    props = {}
    _.each(naturals_names, function(prop) {
      props["natural_"+prop] = shape[prop];
    });
    shape.set(props);
  }

  function ensureShape(id, type) {
    if (shapes[id] == undefined) {
      console.log("UNDEF SHAPE", id);
      var shape;
      switch (type) {
        case 'rect':
          shape = new fabric.Rect({
            left: 0,
            top: 0,
            scaleX: 50,
            scaleY: 50,
            width: 2,
            height: 2,
            originX: 'center',
            originY: 'center',
            centeredScaling: true
          });
          ensureAddShape(id, shape);
          break;
        case 'ellipse':
          shape = new fabric.Circle({
            left: 0,
            top: 0,
            radius: 1,
            scaleX: 50,
            scaleY: 50,
            originX: 'center',
            originY: 'center',
            centeredScaling: true
          });
          ensureAddShape(id, shape);
          break;
        case 'image':
          shape = new fabric.Rect({
            left: 0,
            top: 0,
            scaleX: 50,
            scaleY: 50,
            width: 2,
            height: 2,
            originX: 'center',
            originY: 'center',
            centeredScaling: true
          });
          ensureAddShape(id, shape);
          break;
      }
    }

    if (type == 'image') {
      block = Blockly.mainWorkspace.getBlockById(id);
      var image_url = block.getFieldValue('IMAGE');
      if (image_url != block.last_image_url && image_url != "NONE") {
        console.log("REPLACING");
        props = _.pick(shapes[id], "left", "top", "scaleX", "scaleY", "angle");
        canvas.remove(shapes[id]);
        shapes[id] = -1;

        fabric.Image.fromURL(image_url, function(shape) {
          shape.set({
            left: 0,
            top: 0,
            scaleX: 50,
            scaleY: 50,
            width: 2,
            height: 2,
            originX: 'center',
            originY: 'center',
            centeredScaling: true
          });
          shape.set(props);
          ensureAddShape(id, shape);
          console.log("XXX", shapes[id]);
        });
      }

      block.last_image_url = image_url;
    }
  }

  function ensureAddShape(id, shape) {
    if (loaded_shapes_dict[id]) {
      shape.set(loaded_shapes_dict[id]);
    }
    updateShapeNaturals(shape);

    shape.on("moving", function() {
      updateShapeNaturals(this);
    });
    shape.on("rotating", function() {
      updateShapeNaturals(this);
    });
    shape.on("scaling", function() {
      updateShapeNaturals(this);
    });
    shapes[id] = shape;
    canvas.add(shape);
    canvas.renderAll();
  }

  cur_shape_id = -1;
  function beginShape(id) {
    cur_shape_id = id;
    var shape = shapes[cur_shape_id];
    if (shape && shape != -1)
      applyShapeNaturals(shape);
  }

  function endShape() {
    cur_shape_id = -1;
  }

  function driveProperty(name, value) {
    if (value == null) value = getDefaultProperty();
    var shape = shapes[cur_shape_id];

    if (!shape || shape == -1) return;

    var canvas_width = $("#fabric-container").width();
    var canvas_height = $("#fabric-container").height();
    if (shape) {
      switch (name) {
        case 'x':
          shape.set({ left: value * canvas_width });
          break;
        case 'y':
          shape.set({ top: value * canvas_height });
          break;
        case 'dx':
          shape.set({ left: shape.get("natural_left") + value * canvas_width });
          break;
        case 'dy':
          shape.set({ top: shape.get("natural_top") + value * canvas_height });
          break;
        case 'th':
          shape.set({ angle: value });
          break;
        case 'dth':
          shape.set({ angle: shape.get("natural_angle") + value });
          break;

        case 'scale':
          shape.set({
            scaleX: value * canvas_width,
            scaleY: value * canvas_height
          });
          break;
        case 'dscale':
          shape.set({
            scaleX: shape.get("natural_scaleX") + value * canvas_width,
            scaleY: shape.get("natural_scaleY") + value * canvas_height
          });
          break;

        case 'scale_x':
          shape.set({ scaleX: value * canvas_width });
          break;
        case 'dscale_x':
          shape.set({ scaleX: shape.get("natural_scaleX") + value * canvas_width });
          break;
        case 'scale_y':
          shape.set({ scaleY: value * canvas_height });
          break;
        case 'dscale_y':
          shape.set({ scaleY: shape.get("natural_scaleY") + value * canvas_height });
          break;
        case 'color':
          shape.set({ fill: value });
          break;
      }
      shape.set({selectable: true});
      shape.setCoords();
      canvas.renderAll();
    }
  }

  function getDefaultProperty() {
    return 0;
  }


  function updatePinMap() {
    var pin_map = {}
    _.each(block_to_pin_conf, function(pin_conf, block_id) {
      if (pin_conf.pin == "none") return;
      pin_map[pin_conf.pin] = pin_conf.mode;
    });
    pin_map = _.map(pin_map, function(mode, pin) { return { pin: pin, mode: mode } } );

    var server_pin_map = _.sortBy(_.values(pin_map), 'pin');
    server_pin_map = _.map(server_pin_map, function(pin) { return {pin: pin.pin, mode: pin.mode} });

    if (JSON.stringify(last_server_pin_map) != JSON.stringify(server_pin_map)) {
      console.log("pin_map changed", JSON.stringify(server_pin_map));
      socket.emit('pin_map', server_pin_map);
    }
    last_server_pin_map = server_pin_map;
  }

  function updateBlockly() {
    block_to_pin_conf = {}

    Blockly.JavaScript.addReservedWords('code');
    var code = Blockly.JavaScript.workspaceToCode();

    updatePinMap();

    // remove deleted blocks
    var valid_shape_ids = _.pluck(Blockly.mainWorkspace.getAllBlocks(), "id");
    _.each(shapes, function(shape, id) {
      if (!_.contains(valid_shape_ids,id)) {
        canvas.remove(shape);
        delete shapes[id];
      }
    });

    canvas_code = code;
    console.log(canvas_code);
  }

  function getDigitalValue(block_id, off_value, on_value, transition_time) {
    pin_conf = block_to_pin_conf[block_id];
    if (pin_conf) {
      if (pin_conf.transition_time == 0) {
        return pin_conf.cur_value;
      } else if (pin_conf.cur_transition) {
        var elapsed = ((new Date()).getTime() - pin_conf.cur_transition[0]) / 1000.0;
        if (elapsed > pin_conf.transition_time) elapsed = pin_conf.transition_time;
        pin_conf.cur_value = fmap(
          elapsed,
          0, pin_conf.transition_time, 
          pin_conf.cur_transition[1], pin_conf.cur_transition[2]
        );
      }
    }
    return pin_conf.cur_value;
  }

  function getAnalogValue(block_id, off_value, on_value, transition_time) {
    pin_conf = block_to_pin_conf[block_id];
    var val = 0;
    if (pin_conf) {
      val = pin_conf.cur_value;
    }
    return val;
  }

  function initializeBlockly() {
    Blockly.Blocks['group'] = {
      init: function() {
        this.setColour(160);
        this.appendDummyInput()
            .appendField("group");
        this.appendStatementInput("properties")
            .appendField("properties")
            .setCheck("value_setter");
        this.appendStatementInput("shapes")
            .appendField("shapes")
            .setCheck("shape");
        this.setPreviousStatement(true, "shape");
        this.setNextStatement(true, "shape");
      }
    };

    var shape_types = ["rect", "ellipse", "image"];
    
    _.each(shape_types, function(shape_type) {
      Blockly.Blocks[shape_type] = {
        init: function() {
          this.setColour(160);
          this.appendDummyInput()
              .appendField(shape_type);
          this.appendStatementInput("properties")
              .appendField("properties")
              .setCheck("value_setter");
          var colour = new Blockly.FieldColour('#ff0000');
          this.appendValueInput("colour")
            .appendField("color")
            .appendField(colour, 'colour_manual')
            .setCheck("Colour");
          if (shape_type == "image") {
            this.appendDummyInput()
              .appendField("image")
              .appendField(new Blockly.FieldDropdown(function() {
                var ddl = [["none", "NONE"]];
                _.each(images, function(im) {
                  ddl.push([im.name, im.path]);
                });
                console.log("returning", ddl);
                return ddl;
              }), "IMAGE");
          }
        }
      };

      Blockly.JavaScript[shape_type] = function(block) {
        var prop_setters = Blockly.JavaScript.statementToCode(block, 'properties');
        var colour_manual = block.getFieldValue('colour_manual');
        var colour_driven = Blockly.JavaScript.valueToCode(block, 'colour', Blockly.JavaScript.ORDER_ADDITION) || null;

        if (colour_driven != null) 
          prop_setters += "driveProperty('color', "+colour_driven+");";
        else
          prop_setters += "driveProperty('color', '"+colour_manual+"');";
        
        var code = "\
          ensureShape({{block_id}}, '{{shape_type}}');\
          beginShape({{block_id}});\
          {{prop_setters}}\
          endShape();\
        "
        var code = S(code).template({block_id: block.id, prop_setters: prop_setters, shape_type: shape_type}).s;
        return code;
      };
    });



    Blockly.Blocks['sin'] = {
      init: function() {
        this.setColour(100);
        this.appendDummyInput()
            .appendField("sin")
        this.appendDummyInput()
            .setAlign(Blockly.ALIGN_RIGHT)
            .appendField("min value")
            .appendField(new Blockly.FieldTextInput("0", Blockly.FieldTextInput.numberValidator), "min_value");
        this.appendDummyInput()
            .setAlign(Blockly.ALIGN_RIGHT)
            .appendField("max value")
            .appendField(new Blockly.FieldTextInput("1", Blockly.FieldTextInput.numberValidator), "max_value");
        this.appendDummyInput()
            .setAlign(Blockly.ALIGN_RIGHT)
            .appendField("phase")
            .appendField(new Blockly.FieldTextInput("0", Blockly.FieldTextInput.numberValidator), "phase");
        this.appendDummyInput()
            .setAlign(Blockly.ALIGN_RIGHT)
            .appendField("speed")
            .appendField(new Blockly.FieldTextInput("1", Blockly.FieldTextInput.numberValidator), "speed");
        this.setOutput(true, "Number");
      }
    };

    Blockly.JavaScript['sin'] = function(block) {
      var code = "fmap(Math.sin((new Date()).getTime() / 1000.0 * {{speed}} + {{phase}} * Math.PI/180), -1, 1, {{min_value}}, {{max_value}})";
      code = S(code).template({
        phase: block.getFieldValue('phase') || 0,
        speed: block.getFieldValue('speed') || 1,
        min_value: block.getFieldValue('min_value') || -1,
        max_value: block.getFieldValue('max_value') || 1,
      }).s;
      return [code, Blockly.JavaScript.ORDER_ADDITION];
    };

    Blockly.JavaScript['text_print'] = function(block) {
      // Print statement.
      var argument0 = Blockly.JavaScript.valueToCode(block, 'TEXT',
          Blockly.JavaScript.ORDER_NONE) || '\'\'';
      return 'console.log(' + argument0 + ');\n';
    };

    Blockly.Blocks['digital_input'] = {
      init: function() {
        this.setColour(260);
        this.appendDummyInput()
            .appendField("digital input pin")
            .appendField(new Blockly.FieldDropdown(_.map(digital_pins, function(i) {return [i.toString(),i.toString()]})), "pin");
        this.appendDummyInput()
            .setAlign(Blockly.ALIGN_RIGHT)
            .appendField("off value")
            .appendField(new Blockly.FieldTextInput("0", Blockly.FieldTextInput.numberValidator), "off_value");
        this.appendDummyInput()
            .setAlign(Blockly.ALIGN_RIGHT)
            .appendField("on value")
            .appendField(new Blockly.FieldTextInput("1", Blockly.FieldTextInput.numberValidator), "on_value");
        this.appendDummyInput()
            .setAlign(Blockly.ALIGN_RIGHT)
            .appendField("time")
            .appendField(new Blockly.FieldTextInput("0", Blockly.FieldTextInput.numberValidator), "transition_time");
        this.setOutput(true, "Number");
        this.setTooltip('');
      }
    };

    Blockly.Blocks['analog_input'] = {
      init: function() {
        this.setColour(128);
        this.appendDummyInput()
            .appendField("analog input pin")
            .appendField(new Blockly.FieldDropdown(_.map(analog_pins, function(i) {return [i.toString(),i.toString()]})), "pin");
        this.appendDummyInput()
            .setAlign(Blockly.ALIGN_RIGHT)
            .appendField("min value")
            .appendField(new Blockly.FieldTextInput("0", Blockly.FieldTextInput.numberValidator), "min_value");
        this.appendDummyInput()
            .setAlign(Blockly.ALIGN_RIGHT)
            .appendField("max value")
            .appendField(new Blockly.FieldTextInput("1", Blockly.FieldTextInput.numberValidator), "max_value");
        this.setOutput(true, "Number");
        this.setTooltip('');
      }
    };

    Blockly.Blocks['acc_axis'] = {
      init: function() {
        this.setColour(190);
        this.appendDummyInput()
            .appendField("accelerometer axis")
            .appendField(new Blockly.FieldDropdown([["x","x"],["y","y"],["z","z"]]), "axis");
        this.appendDummyInput()
            .setAlign(Blockly.ALIGN_RIGHT)
            .appendField("min value")
            .appendField(new Blockly.FieldTextInput("0", Blockly.FieldTextInput.numberValidator), "min_value");
        this.appendDummyInput()
            .setAlign(Blockly.ALIGN_RIGHT)
            .appendField("max value")
            .appendField(new Blockly.FieldTextInput("1", Blockly.FieldTextInput.numberValidator), "max_value");
        this.setOutput(true, "Number");
      }
    };

    Blockly.JavaScript['digital_input'] = function(block) {
      var pin = block.getFieldValue("pin");
      var off_value = parseFloat(block.getFieldValue("off_value")) || 0;
      var on_value = parseFloat(block.getFieldValue("on_value")) || 1;
      var transition_time = parseFloat(block.getFieldValue("transition_time")) || 0;

      if (pin != -1)
        block_to_pin_conf[block.id] = {
          pin: pin,
          mode: "digital",
          off_value: off_value,
          on_value: on_value,
          cur_value: off_value,
          cur_transition: null,
          transition_time: transition_time
        };

      var code = "getDigitalValue({{block_id}}, {{off_value}}, {{on_value}}, {{transition_time}})";
      code = S(code).template({
        block_id: block.id,
        off_value: off_value,
        on_value: on_value,
        transition_time: transition_time
      }).s;
      return [code, Blockly.JavaScript.ORDER_ADDITION];
    };

    Blockly.JavaScript['analog_input'] = function(block) {
      var pin = block.getFieldValue("pin");
      var min_value = parseFloat(block.getFieldValue("min_value")) || 0;
      var max_value = parseFloat(block.getFieldValue("max_value")) || 1;

      if (pin != -1)
        block_to_pin_conf[block.id] = {
          pin: pin,
          mode: "analog",
          min_value: min_value,
          max_value: max_value
        };

      var code = "getAnalogValue({{block_id}}, {{min_value}}, {{max_value}})";
      code = S(code).template({
        block_id: block.id,
        min_value: block.getFieldValue('min_value') || 0,
        max_value: block.getFieldValue('max_value') || 1
      }).s;
      return [code, Blockly.JavaScript.ORDER_ADDITION];
    };

    var props = ["none", "x", "y", "dx", "dy", "th", "dth", "scale", "d_scale", "scale_x", "scale_y", "dscale_x", "dscale_y"];
    Blockly.Blocks['set_property'] = {
      init: function() {
        this.setColour(20);
        this.appendDummyInput()
            .appendField("property")
            .appendField(new Blockly.FieldDropdown(_.map(props, function(i) {return [i.toString(),i.toString()]})), "property");
        this.appendValueInput("value");
        this.setPreviousStatement(true, "value_setter");
        this.setNextStatement(true, "value_setter");
      }
    };
    Blockly.JavaScript['set_property'] = function(block) {
      var prop = block.getFieldValue('property');
      var code = "driveProperty('{{prop}}', {{value}});";
      code = S(code).template({
        prop: prop,
        value: Blockly.JavaScript.valueToCode(block, 'value', Blockly.JavaScript.ORDER_ADDITION) || null
      }).s;
      return code;
    };

    Blockly.inject(
      document.getElementById('blockly'), {
        toolbox: document.getElementById('toolbox')
      }
    );

    Blockly.addChangeListener(updateBlockly);
    Blockly.bindEvent_(window, "blocklySelectChange", this, function() {
      if (Blockly.selected) {
        if (shapes[Blockly.selected.id])
          canvas.setActiveObject(shapes[Blockly.selected.id]);
      } else {
        canvas.deactivateAll().renderAll();
      }
    });
  };

  function setupUpload() {
    $("#upload-button").click(function() {
      $('#upload-modal').modal('show'); 
    });

    $("#upload-button2").click(function() {
      console.log("HERE");
      $("#upload-modal").ajaxSubmit({
        url: "/images",
        type: "POST",
        error: function(xhr) {
          status('Error: ' + xhr.status);
        },
        success: function(response) {
          console.log(response);
          fetchImages();
        }
      });
      $('#upload-modal').modal('hide'); 
      return false;
    });
  }

  function fetchImages() {
    $.get("/images", function(data) {
      images = data;
      console.log("fetched images", images);
    });
  }

  function setupSaveAndLoad() {
    $("#save-button").click(function() {
      $('#save-modal').modal('show'); 
    });
    $("#save-button2").click(function() {
      var name = $('#workspace-name').val();
      saveWorkspace(name);
    });
    fetchSavedWorkspaces();
  }

  function loadWorkspace(name) {
    console.log("loading", name);
    $.getJSON("/workspaces/"+name, function(data) {
      var blockly_xml =  data.blockly_xml;
      var shapes_dict = data.shapes_dict;
      _.each(shapes_dict, function(shape_dict, key) {
        key = key.substr(6);
        loaded_shapes_dict[key] = shape_dict;
      });

      console.log("received", blockly_xml, loaded_shapes_dict);
      Blockly.getMainWorkspace().clear();
      Blockly.Xml.domToWorkspace(Blockly.getMainWorkspace(), Blockly.Xml.textToDom(blockly_xml));
    });
  }

  function saveWorkspace(name) {
    var shapes_dict = {}
    _.each(shapes, function(shape, id) {
      console.log(id, shape);
      shapes_dict["shape_"+id] = {}
      _.each(naturals_names, function(name) {
        shapes_dict["shape_"+id][name] = shape["natural_"+name];
      });
      console.dir(shape);
    })
    var blockly_xml = Blockly.Xml.workspaceToDom(Blockly.getMainWorkspace()).outerHTML;

    $.post("/workspaces", {
      name: name,
      workspace: {
        blockly_xml: blockly_xml,
        shapes_dict: shapes_dict
      }
    });
    $('#save-modal').modal('hide'); 
    fetchSavedWorkspaces();
  }

  function fetchSavedWorkspaces() {
    $.get("/workspaces", function(data) {
      console.log(data);
      $("#load-workspaces").empty();
      _.each(data, function(d) {
        console.log(d);
        var el = $("<li><a href='#'>"+d.name+"</a></li>");
        el.find("a").click( function() {
          var name = this.innerText;
          window.location = window.location.href.split("?")[0] + "?workspace=" + name;
        });

        $("#load-workspaces").append(el);
      });
    });
  }

  var workspace_name = getParameterByName("workspace");
  if (workspace_name) {
    loadWorkspace(workspace_name);
  }

});


