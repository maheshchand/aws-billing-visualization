import { Component, OnInit, OnChanges, ElementRef, EventEmitter } from '@angular/core';
import * as d3 from 'd3';
import { AwsdataService } from './../../services/awsdata.service';
import { ConfigService } from './../../services/config.service';

@Component({
    moduleId: module.id,
    selector: 'd3-map',
    template: ``,
    inputs: ['appcomponentdata'],
    outputs: ['isloading', 'selectRegion']
})

export class D3mapComponent implements OnInit, OnChanges {
    private startdate: string;
    private enddate: string;
    private isloading = new EventEmitter();
    private parentNativeElement: any;
    private margin = { top: 80, right: 0, bottom: 0, left: 0 };
    private width: number;
    private height: number;
    private rotate: number = 0;//60;
    private maxlat: number = 83;
    private svg: any;
    private legendSvg: any;
    private projection: any;
    private path: any;
    private tooltipGroup: any;
    private worldMapJson: string = "app/components/d3map/worldmap.json";
    private company: string;
    private selectionMap: any;

    appcomponentdata: any;
    appdataloaded = false;

    selectedRegion: string;
    selectRegion: EventEmitter<string> = new EventEmitter<string>();

    detailReportOption: any;

    colorRange = ["#ffe6e6", "#800000"];
    constructor(private element: ElementRef,
        private _awsService: AwsdataService,
        private _config: ConfigService) {
        this.company = this._config.company;
        this.parentNativeElement = element.nativeElement;
        this.width = 530 - this.margin.left - this.margin.right;
        this.height = 320 - this.margin.top - this.margin.bottom;
    }

    ngOnInit(): void {
        this.initSvg();
        this.getProjection();
        this.getPath();
        this.getTooltip();
    }

    ngOnChanges(): void {
        if (this.appcomponentdata.allServiceData) {
            this.parseD3Data(this.appcomponentdata.allServiceData);
        }

    }

    parseD3Data(data: any): void {
        if (data && data.aggregations) {
            if (data.aggregations.AvailabilityRegion) {
                let regionData = {};
                let maxval = 0;
                let priceArr = [0];
                for (let region of data.aggregations.AvailabilityRegion.buckets) {
                    if (region.TotalBlendedCost.value > 0) {
                        if (maxval < region.TotalBlendedCost.value) {
                            maxval = Math.ceil(region.TotalBlendedCost.value);
                        }
                        priceArr.push(Math.ceil(region.TotalBlendedCost.value));
                        regionData[region.key] = {
                            name: region.key,
                            totalcost: parseFloat(region.TotalBlendedCost.value).toFixed(2),
                            totalresource: region.doc_count
                        }
                    }
                }
                regionData['maxval'] = maxval;
                priceArr.sort(function (a, b) { return a - b });
                regionData['pricedata'] = priceArr;
                this.drawMap(regionData);
            }
        }
    }

    getRegionsData() {
        let awsdata = {
            company: this.company,
            strdate: this.appcomponentdata.startdate,
            enddate: this.appcomponentdata.enddate
        };
        this._awsService.getRegionsData(awsdata).subscribe((regionsData) => {
            this.parseD3Data(regionsData);
        }, (error) => {
            console.log(error);
            this.isloading.emit(false);
        })
    }



    initSvg(): void {
        if (this.parentNativeElement !== null) {
            this.svg = d3.select(this.parentNativeElement)
                .append('svg')
                .attr("width", this.width + this.margin.left + this.margin.right)
                .attr("height", this.height + this.margin.top + this.margin.bottom)
                .append("g")
                .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")")
                .append("g")
                .attr("width", this.width)
                .attr("height", this.height);

            this.legendSvg = d3.select(this.parentNativeElement).append("svg")
                .attr("class", "legend")
                .attr("width", 110)
                .attr("height", this.height + this.margin.top + this.margin.bottom);
        }
    }

    getProjection(): void {
        this.projection = d3.geoMercator()
            .rotate([this.rotate, 0])
            .scale(1)
            .translate([this.width / 2, this.height / 2]);

        // set up the scale extent and initial scale for the projection
        var b = this.mercatorBounds(this.projection, this.maxlat),
            s = this.width / (b[1][0] - b[0][0]),
            scaleExtent = [s, 10 * s];

        this.projection
            .scale(scaleExtent[0]);
    }

    getPath(): void {
        this.path = d3.geoPath()
            .projection(this.projection);
    }

    // find the top left and bottom right of current projection
    mercatorBounds(projection, maxlat) {
        var yaw = projection.rotate()[0],
            xymax = projection([-yaw + 180 - 1e-6, -maxlat]),
            xymin = projection([-yaw - 180 + 1e-6, maxlat]);

        return [xymin, xymax];
    }

    getTooltip(): void {
        this.tooltipGroup = d3.select(this.parentNativeElement)
            .append("div")
            .attr("class", "tooltipcss").style("opacity", 0);
    }

    drawMap(data): void {
        let that = this;
        d3.json(this.worldMapJson, (error, collection) => {
            if (error) throw error;

            this.selectionMap = this.svg.selectAll("path")
                .data(collection.features);

            let color = d3.scaleLinear<string>()
                .domain([0, data.maxval])
                .range(this.colorRange);

            this.legendSvg.html('');
            var legendG = this.legendSvg.selectAll("g")
                .data(data.pricedata)
                .enter()
                .append("g");

            legendG.append("rect")
                .attr("transform", function (d, i) { return "translate(20, " + (280 - (i * 24)) + ")"; })
                .attr("width", 20)
                .attr("height", 25)
                .style("fill", function (d, i) { return color(d); });

            legendG.append("text")
                .attr("x", 43)
                .attr("y", function (d, i) { return (290 - (i * 24)); })
                .attr("dy", ".35em")
                .text(function (d) { return "$" + d; });

            this.selectionMap.enter().append("path")
                .attr("class", (d) => { return "subunit " + d.id; })
                .attr("d", this.path)
                .attr("fill", "#ccc")
                .attr("stroke", "#fff");

            this.svg.append("g")
                .attr("class", "bubble")
                .selectAll("circle")
                .data(collection.features)
                .enter().append("circle")
                .attr("transform", (d) => {
                    return "translate(" + this.path.centroid(d) + ")";
                });

            this.svg.selectAll("circle")
                .attr("r", (d) => {
                    if (data.hasOwnProperty(d.id)) {
                        return 12;
                    }
                })
                .attr("circleClicked", "No")
                .attr("class", (d) => {
                    if (data.hasOwnProperty(d.id)) {
                        return "resource-region";
                    }
                })
                .style("cursor", "pointer")
                .attr("fill", (d) => {
                    if (data.hasOwnProperty(d.id)) {
                        return color(data[d.id].totalcost);
                    }
                })
                .on("click", function (d, i) {
                    if (d3.select(this).attr("circleClicked") == "No") {
                        d3.selectAll("[circleClicked=Yes]")
                            .attr("circleClicked", "No")
                            .transition()
                            .duration(500)
                            .attr("stroke", "none");

                        d3.select(this)                            
                            .attr("circleClicked", "Yes")
                            .transition()
                            .duration(500)
                            .attr("stroke", "blue")
                            .attr("stroke-width", 2);

                    }
                    else if (d3.select(this).attr("circleClicked") == "Yes") {
                        d3.select(this)
                            .attr("circleClicked", "No")
                            .transition()
                            .duration(500)
                            .attr("stroke", "none");
                    }
                    that.selectRegion.emit(d.id);
                })
                .on("mouseover", (d) => {
                    let tooltext = d.properties.name + "<br/>"
                        + "Region : " + d.id + "<br/>";
                    if (data.hasOwnProperty(d.id)) {
                        tooltext = d.properties.name + "<br/>"
                            + "Region : " + data[d.id].name + "<br/>"
                            + "Total Hours : " + data[d.id].totalresource + "<br/>"
                            + "Total Cost : $" + data[d.id].totalcost;

                    }
                    this.tooltipGroup.transition()
                        .duration(200)
                        .style("opacity", .9);
                    this.tooltipGroup.html(tooltext)
                        .style("left", (d3.event.pageX) + "px")
                        .style("top", (d3.event.pageY+20) + "px");
                })
                .on("mousemove", (d) => {
                    this.tooltipGroup
                        .style("top", (d3.event.pageY+20) + "px")
                        .style("left", (d3.event.pageX - 100) + "px");
                })
                .on("mouseout", (d) => {
                    this.tooltipGroup.transition()
                        .duration(500)
                        .style("opacity", 0);
                });

        })


    }

}