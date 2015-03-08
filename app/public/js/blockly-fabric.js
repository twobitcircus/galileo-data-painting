function fmap(val, imin, imax, omin, omax) {
  var norm = (1.0*val - imin) / (imax - imin);
  return omin + norm * (omax - omin);
}

$(function() {
  initializeBlockly();
  var socket = io();

  var canvas = this.__canvas = new fabric.Canvas('fabric');

  canvas.setWidth($("#fabric-container").width());
  canvas.setHeight($("#fabric-container").height());

  fabric.Object.prototype.transparentCorners = false;

  var shapes = {};
  var canvas_code = "";
  var last_pin_map = {};
  var pin_map = {};
  var pins = [-1, 44]; // pins we're allowed to use

  setInterval(function() {
    try {
      eval(canvas_code);
    } catch (e) {
      console.log(e);
    }
  }, 50);

  socket.on("pin_state", function(pin_state) {
    console.log("pin_state", pin_state);
  });

  function updateShapeNaturals(shape) {
    props = {}
    _.each(["left", "top", "width", "height", "angle"], function(prop) {
      props["natural_"+prop] = shape[prop];
    });
    shape.set(props);
  }

  function ensureShape(id, prop_dict) {
    if (shapes[id] == undefined) {
      var rect = new fabric.Rect({
        left: 100,
        top: 50,
        width: 100,
        height: 100,
        angle: 20,

        fill: 'green',
        padding: 10,
        originX: "center",
        originY: "center",
      });
      updateShapeNaturals(rect);

      rect.on("moving", function() {
        updateShapeNaturals(this);
      });
      shapes[id] = rect;
      canvas.add(rect);
    }
  }

  var cur_shape_id = -1;
  function beginShape(id) {
    cur_shape_id = id;
  }

  function endShape() {
    cur_shape_id = -1;
  }

  function driveProperty(name, value) {
    if (value == null) value = getDefaultProperty();
    var shape = shapes[cur_shape_id];
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
        case 'scale_x':
          shape.set({ width: value * canvas_width });
          break;
        case 'dscale_x':
          shape.set({ width: shape.get("natural_width") + value * canvas_width });
          break;
        case 'scale_y':
          shape.set({ height: value * canvas_height });
          break;
        case 'dscale_y':
          shape.set({ height: shape.get("natural_height") + value * canvas_height });
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


  function updateBlockly() {
    last_pin_map = pin_map;
    pin_map = {}

    Blockly.JavaScript.addReservedWords('code');
    var code = Blockly.JavaScript.workspaceToCode();

    if (JSON.stringify(pin_map) != JSON.stringify(last_pin_map)) {
      console.log("pin_map changed", pin_map);
      socket.emit('pin_map', pin_map);
    }

    canvas_code = code;
  }

  function getDigitalValue(pin, off_value, on_value, transition_time) {
      return 0;
  }

  function getAnalogValue(pin, off_value, on_value, transition_time) {
      return 0;
  }

  function initializeBlockly() {
    Blockly.Blocks['rectangle'] = {
      init: function() {
        this.setColour(160);
        this.appendDummyInput()
            .appendField("rectangle");
        this.appendStatementInput("properties")
            .setCheck("value_setter");
        this.setTooltip('');
      }
    };

    Blockly.JavaScript['rectangle'] = function(block) {
      var prop_setters = Blockly.JavaScript.statementToCode(block, 'properties');
      
      var code = "\
        ensureShape({{block_id}});\
        beginShape({{block_id}});\
        {{prop_setters}}\
        endShape();\
      "
      var code = S(code).template({block_id: block.id, prop_setters: prop_setters}).s;
      return code;
    };

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
            .appendField(new Blockly.FieldDropdown(_.map(pins, function(i) {return [i.toString(),i.toString()]})), "pin");
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
            .appendField(new Blockly.FieldDropdown(_.map(pins, function(i) {return [i.toString(),i.toString()]})), "pin");
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

    Blockly.JavaScript['digital_input'] = function(block) {
      var pin = block.getFieldValue("pin") || -1;
      var off_value = block.getFieldValue("off_value") || 0;
      var on_value = block.getFieldValue("on_value") || 1;
      var transition_time = block.getFieldValue("transition_time") || 0;

      if (pin != -1)
        pin_map[pin] = {
          mode: "digital",
          off_value: off_value,
          on_value: on_value,
          cur_value: off_value,
          cur_transition: null,
          transition_time: transition_time
        };

      var code = "getDigitalValue({{pin}}, {{off_value}}, {{on_value}}, {{transition_time}})";
      code = S(code).template({
        pin: pin,
        off_value: off_value,
        on_value: on_value,
        transition_time: transition_time
      }).s;
      return [code, Blockly.JavaScript.ORDER_ADDITION];
    };

    Blockly.JavaScript['analog_input'] = function(block) {
      var pin = block.getFieldValue("pin") || -1;
      var min_value = block.getFieldValue("min_value") || 0;
      var max_value = block.getFieldValue("max_value") || 1;

      if (pin != -1)
        pin_map[pin] = {
          mode: "analog",
          min_value: min_value,
          max_value: max_value
        };

      var code = "getAnalogValue({{pin}}, {{min_value}}, {{max_value}})";
      code = S(code).template({
        pin: block.getFieldValue('pin') || -1,
        min_value: block.getFieldValue('min_value') || 0,
        max_value: block.getFieldValue('max_value') || 1
      }).s;
      return [code, Blockly.JavaScript.ORDER_ADDITION];
    };

    var props = ["x", "y", "dx", "dy", "th", "dth", "scale_x", "scale_y", "dscale_y", "dscale_y"];
    _.each(props, function(prop) {
      Blockly.Blocks['set_'+prop] = {
        init: function() {
          this.setColour(20);
          this.appendDummyInput()
            .appendField("set " + prop);
          this.appendValueInput("value");
          this.setPreviousStatement(true, "value_setter");
          this.setNextStatement(true, "value_setter");
        }
      };
      Blockly.JavaScript['set_'+prop] = function(block) {
        var code = "driveProperty('{{prop}}', {{value}});";
        code = S(code).template({
          prop: prop,
          value: Blockly.JavaScript.valueToCode(block, 'value', Blockly.JavaScript.ORDER_ADDITION) || null
        }).s;
        return code;
      };
      $("category[name='Properties']").append($("<block type='set_"+prop+"'></block>"));
    });


    Blockly.inject(
      document.getElementById('blockly'), {
        toolbox: document.getElementById('toolbox')
      }
    );

    Blockly.addChangeListener(updateBlockly);
  };
});



